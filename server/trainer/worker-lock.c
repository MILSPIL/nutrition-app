// Late policy: synchronize every already-created Python/Peer/asyncio thread.
#define _GNU_SOURCE
#include <seccomp.h>
#include <sched.h>
#include <errno.h>
#include <signal.h>
#include <time.h>
#include <string.h>

int scisense_lock_worker(void) {
 if(seccomp_arch_native()!=SCMP_ARCH_X86_64)return -1;
 scmp_filter_ctx ctx=seccomp_init(SCMP_ACT_ALLOW); if(!ctx)return -2;
 if(seccomp_attr_set(ctx,SCMP_FLTATR_CTL_TSYNC,1)<0) {seccomp_release(ctx);return -3;}
 const char *denied[]={"execve","execveat","fork","vfork","unshare","setns","mount","umount2","pivot_root","chroot","ptrace","process_vm_readv","process_vm_writev","bpf","userfaultfd","open_by_handle_at"};
 for(unsigned i=0;i<sizeof(denied)/sizeof(*denied);i++) {
  int nr=seccomp_syscall_resolve_name(denied[i]);
  if(nr==__NR_SCMP_ERROR||seccomp_rule_add(ctx,SCMP_ACT_ERRNO(EPERM),nr,0)<0){seccomp_release(ctx);return -4;}
 }
 if(seccomp_rule_add(ctx,SCMP_ACT_ERRNO(ENOSYS),SCMP_SYS(clone3),0)<0){seccomp_release(ctx);return -5;}
 const unsigned long denied_flags[]={CLONE_NEWUSER,CLONE_NEWNS,CLONE_NEWNET,CLONE_NEWPID,CLONE_NEWIPC,CLONE_NEWUTS,CLONE_NEWCGROUP};
 for(unsigned i=0;i<sizeof(denied_flags)/sizeof(*denied_flags);i++)
  if(seccomp_rule_add(ctx,SCMP_ACT_ERRNO(EPERM),SCMP_SYS(clone),1,SCMP_A0(SCMP_CMP_MASKED_EQ,denied_flags[i],denied_flags[i]))<0){seccomp_release(ctx);return -6;}
 const unsigned long required[]={CLONE_THREAD,CLONE_VM,CLONE_SIGHAND};
 for(unsigned i=0;i<sizeof(required)/sizeof(*required);i++)
  if(seccomp_rule_add(ctx,SCMP_ACT_ERRNO(EPERM),SCMP_SYS(clone),1,SCMP_A0(SCMP_CMP_MASKED_EQ,required[i],0))<0){seccomp_release(ctx);return -7;}
 int result=seccomp_load(ctx); seccomp_release(ctx); return result;
}

// A kernel timer delivers unmaskable SIGKILL, independent of Python/Node loops.
static timer_t deadline;
static int initialized=0;
int scisense_deadline_arm(int milliseconds) {
 if(milliseconds<1||milliseconds>90000)return -1;
 if(!initialized) {
  struct sigevent event; memset(&event,0,sizeof(event));
  event.sigev_notify=SIGEV_SIGNAL;event.sigev_signo=SIGKILL;
  if(timer_create(CLOCK_MONOTONIC,&event,&deadline)<0)return -2;
  initialized=1;
 }
 struct itimerspec value;memset(&value,0,sizeof(value));
 value.it_value.tv_sec=milliseconds/1000;
 value.it_value.tv_nsec=(milliseconds%1000)*1000000L;
 return timer_settime(deadline,0,&value,0);
}

int scisense_deadline_disarm(void) {
 if(!initialized)return 0;
 struct itimerspec value;memset(&value,0,sizeof(value));
 return timer_settime(deadline,0,&value,0);
}
