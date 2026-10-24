// Build-time policy generator. libseccomp supplies ABI-specific syscall numbers
// and rejects other ABIs. No runtime mutation of host namespace/sysctl settings.
#define _GNU_SOURCE
#include <seccomp.h>
#include <sched.h>
#include <errno.h>
#include <stdio.h>
#include <unistd.h>
int main(void) {
 if (seccomp_arch_native()!=SCMP_ARCH_X86_64) return 2;
 scmp_filter_ctx ctx=seccomp_init(SCMP_ACT_ALLOW); if(!ctx)return 3;
 const char *denied[]={"unshare","setns","mount","umount2","pivot_root","chroot","ptrace","process_vm_readv","process_vm_writev","bpf","userfaultfd"};
 for(unsigned i=0;i<sizeof(denied)/sizeof(*denied);i++) {
  int nr=seccomp_syscall_resolve_name(denied[i]);
  if(nr==__NR_SCMP_ERROR||seccomp_rule_add(ctx,SCMP_ACT_ERRNO(EPERM),nr,0)<0)return 4;
 }
 if(seccomp_rule_add(ctx,SCMP_ACT_ERRNO(ENOSYS),SCMP_SYS(clone3),0)<0)return 5;
 const unsigned long flags[]={CLONE_NEWUSER,CLONE_NEWNS,CLONE_NEWNET,CLONE_NEWPID,CLONE_NEWIPC,CLONE_NEWUTS,CLONE_NEWCGROUP};
 for(unsigned i=0;i<sizeof(flags)/sizeof(*flags);i++)
  if(seccomp_rule_add(ctx,SCMP_ACT_ERRNO(EPERM),SCMP_SYS(clone),1,SCMP_A0(SCMP_CMP_MASKED_EQ,flags[i],flags[i]))<0)return 6;
 int result=seccomp_export_bpf(ctx,STDOUT_FILENO); seccomp_release(ctx);return result<0?7:0;
}
