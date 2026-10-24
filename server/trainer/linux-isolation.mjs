import { realpathSync, lstatSync, existsSync } from "node:fs";
import { join, sep } from "node:path";
// Fixed paths supplied only by the deployment manifest. Never mount host /, /run,
// /etc, /home or the Node state/credentials. All namespace failures are fatal.
export function linuxWorkerCommand({
  source,
  profile,
  workDirectory,
  pythonRoot = "/opt/scisense/python",
}) {
  if (process.arch !== "x64") throw Error("hermes_arch_invalid");
  const dirs = [source, profile, workDirectory, pythonRoot];
  for (const p of dirs)
    if (
      !p.startsWith("/") ||
      realpathSync(p) !== p ||
      !lstatSync(p).isDirectory()
    )
      throw Error("hermes_path_invalid");
  for (const [i, p] of dirs.entries())
    for (const [j, q] of dirs.entries())
      if (i !== j && (p === q || p.startsWith(q + sep)))
        throw Error("hermes_path_overlap");
  const python = join(source, ".venv/bin/python");
  if (!realpathSync(python).startsWith(pythonRoot + sep))
    throw Error("hermes_python_invalid");
  const args = [
    "--unshare-user",
    "--unshare-ipc",
    "--unshare-pid",
    "--unshare-net",
    "--unshare-uts",
    "--unshare-cgroup",
    "--seccomp",
    "3",
    "--die-with-parent",
    "--new-session",
    "--cap-drop",
    "ALL",
    "--ro-bind",
    "/usr",
    "/usr",
  ];
  for (const p of ["/bin", "/lib", "/lib64", "/sbin"])
    if (existsSync(p)) args.push("--ro-bind", p, p);
  args.push(
    "--ro-bind",
    pythonRoot,
    pythonRoot,
    "--ro-bind",
    source,
    source,
    "--bind",
    profile,
    profile,
    "--bind",
    workDirectory,
    workDirectory,
    ...["config.yaml", "SOUL.md", "USER.md", "MEMORY.md"]
      .filter((n) => existsSync(join(profile, n)))
      .flatMap((n) => ["--ro-bind", join(profile, n), join(profile, n)]),
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    "--chdir",
    source,
    "--",
    python,
    join(workDirectory, "hermes_worker.py"),
  );
  return ["/usr/bin/bwrap", args];
}
