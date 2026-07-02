# Runtime workspace

This directory is **not source code**. It is the per-session PTY working directory where the simulator stores:

- `.bash_history_q*` — captured command history per question
- `.exam-session.json` — active exam session metadata
- User-created YAML/shell files during an exam

Nothing under `sandbox/` is committed to git except this README.

In **kind mode**, Kubernetes state lives in the real cluster. Course task templates are mounted from `exams/mock/1/course/` to `/opt/course` inside the backend container.
