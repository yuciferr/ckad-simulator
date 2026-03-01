# CKAD Simulator

Local CKAD (Certified Kubernetes Application Developer) exam simulator with a real terminal, realistic questions, and self-scoring.

## Features

- **Realistic Exam UI**: PSI exam environment-like interface with split panes
- **Real Terminal**: Full PTY-based terminal (vim, kubectl, helm, docker — all work)
- **Per-Question Terminals**: Each question gets its own independent shell session
- **Timer**: 2-hour countdown with visual warnings
- **Question Navigation**: Jump between questions, flag for review
- **Notepad**: Built-in notepad for exam notes
- **Review Mode**: Self-score against answer criteria after exam
- **Extensible**: Add new exams by dropping `.md` files into `/exams`

## Requirements

- **Node.js** >= 18
- **macOS / Linux** (node-pty requirement)
- Xcode Command Line Tools (macOS): `xcode-select --install`
- A Kubernetes cluster (minikube, kind, etc.) for practicing kubectl commands

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

Open http://localhost:3000 in your browser.

## Adding New Exams

Create exam and answer files in the `/exams` directory:

### Exam Format (`exam{N}.md`)

```markdown
---
title: My CKAD Exam
duration: 120
pass_percentage: 66
---

# Question 1 | Topic Name
weight: 7
context: ssh node-name

Question text with `copyable code` inline...

# Question 2 | Another Topic
weight: 4
context: ssh another-node

More question text...
```

### Answer Format (`answer{N}.md`)

```markdown
# Answer 1

- [ ] Criteria item 1 (becomes a scoring checkbox)
- [ ] Criteria item 2
- [ ] Criteria item 3

**Solution:**

Solution text with code blocks...

---

# Answer 2

- [ ] Criteria for question 2

**Solution:**

...
```

### Rules

- Exam files: `exam{N}.md` where N is a number
- Answer files: `answer{N}.md` matching the exam number
- Questions start with `# Question {N} | Title`
- Answers start with `# Answer {N}`
- Answers are separated by `---`
- `- [ ] text` lines become scoring checkboxes in review mode
- Frontmatter (between `---`) supports: `title`, `duration` (minutes), `pass_percentage`

## Keyboard Shortcuts (Terminal)

The terminal is a real shell. All standard shortcuts work:

- `Ctrl+C` — Cancel command
- `Ctrl+R` — Reverse search history
- `Ctrl+L` — Clear screen
- `Tab` — Autocomplete
- Vim: `i`, `Esc`, `:wq`, etc.

## Project Structure

```
ckad-simulator/
├── server.js          # Express + WebSocket + PTY server
├── public/
│   ├── index.html     # Main UI
│   ├── style.css      # PSI-like exam theme
│   └── app.js         # Client application
├── exams/
│   ├── exam1.md       # Exam questions
│   └── answer1.md     # Answers & scoring criteria
├── package.json
└── README.md
```
