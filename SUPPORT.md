# Support

English | [한국어](SUPPORT.ko.md)

Use [GitHub Issues](https://github.com/miinhlym/viewstem/issues) for usage questions,
bug reports, and feature proposals. English and Korean are both welcome. Search
existing discussions in issues before opening another one. For a bug, include the
package version or source commit, environment, a minimal reproduction, and the
expected and actual behavior.

Send security reports through [Security](SECURITY.md). Send community conduct
reports through the [Code of Conduct](CODE_OF_CONDUCT.md). Do not include credentials
or private data in public issues.

## Maintenance policy

For each package, maintenance targets its latest released version. When only
prereleases exist, that means the latest prerelease. Older releases do not have
a separate maintenance or security-backport commitment; a fix may require upgrading.
Reports against the current source branch are welcome, but an unreleased commit
is not a supported published release.

Viewstem is maintained by an individual on a best-effort basis. There is no
guaranteed response time, fix deadline, release schedule, long-term support period,
or service-level agreement. Filing an issue does not guarantee implementation.
The [MIT License](LICENSE) states the software warranty and liability terms.

## Supported behavior and environments

Use the relevant package's documentation for its public contract and limitations:

- [Core](packages/core/README.md): framework-independent runtime and CEL support.
- [Svelte](packages/svelte/README.md): Svelte 5 client renderer and explicit registration.
- [UI](packages/ui/README.md): browser renderer and default JSON component catalog.

The [CI workflow](.github/workflows/core.yml) defines the tested Node matrix.
Current browser evidence covers Chromium. It does not establish Firefox, WebKit,
SSR/hydration, or real mobile gesture support. See the
[documentation map](docs/README.md) for current verification records.

A version in `package.json` or a passing local test is not evidence of npm
publication. Development examples use sample data and are not hosted services.
