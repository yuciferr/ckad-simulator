# Runtime workspace

This directory is **not source code**. It is the per-session PTY working directory where the simulator stores:

- `.bash_history_q*` — captured command history per question
- `.exam-session.json` — active exam session metadata
- `opt/course/` — writable copy of exam course seeds (mock/practice)
- User-created YAML/shell files during an exam

Nothing under `sandbox/` is committed to git except this README.

In **kind mode**, Kubernetes state lives in the real cluster. Course seeds are copied from `exams/{mock|practice}/{id}/course/` on exam reset.
