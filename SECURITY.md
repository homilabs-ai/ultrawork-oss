# Security Policy

Ultrawork runs AI agents that execute shell commands and read files on your machine, so we take security reports seriously.

## Reporting a vulnerability

Please **don't open a public issue.** Report it privately through GitHub instead: open the **Security** tab of this repository and choose **Report a vulnerability**. Include steps to reproduce and the affected version.

We aim to acknowledge reports within a few business days.

## Scope

Things we especially want to hear about:

- Ways for a website, another local process or a network peer to reach the local server (`127.0.0.1:4317`) and start or steer runs.
- Ways for an agent to escape the sandbox: writes outside the workspace, reading denied paths such as `~/.ssh`, or network access outside the allowlist.
- Leaks of API keys stored in `settings.json`.

Prompt injection that makes an agent misbehave *inside* its sandbox is a known limitation of LLM agents. Still report it if it crosses one of the boundaries above.
