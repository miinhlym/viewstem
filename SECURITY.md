# Security policy

English | [한국어](SECURITY.ko.md)

## Report privately

Use [GitHub private vulnerability reporting](https://github.com/miinhlym/viewstem/security/advisories/new)
for suspected vulnerabilities in Viewstem. If that form is unavailable, email
[miinhlym@gmail.com](mailto:miinhlym@gmail.com) with the subject
`Viewstem security report`.

Do not open a public issue or pull request with exploit details or attach real
credentials, access tokens, or private user data. Use a sanitized reproduction.
Please include:

- Affected packages and versions, or the source commit.
- The vulnerable behavior, expected boundary, and potential impact.
- Reproduction steps and a minimal example, including relevant host configuration.
- Any suggested mitigation and whether the issue is already public.

The maintainer will assess the report, discuss reproduction or mitigation with
you, and coordinate publication of a fix or advisory when appropriate. Please
coordinate public disclosure through the private report. Credit can be included
with your permission. No acknowledgment or resolution deadline is guaranteed.

## Scope and supported versions

The version and response commitments in [Support](SUPPORT.md#maintenance-policy)
also apply to security fixes. There is no separate older-version backport commitment.

Reports may concern core validation, capability or cancellation boundaries,
expression evaluation, renderer event handling, or shipped dependencies and
vendored code. A host application's credentials, authorization rules, network
destinations, and data handling remain the host's responsibility. A report showing
that Viewstem violates its documented boundary is welcome even when a host
integration is involved.

The [host contract](docs/spec/07-host-integration.md),
[HTTP and authentication contract](docs/spec/01-datasource-auth.md), and
[CEL support limits](docs/handoff/core-cel-support.md) describe these boundaries
(these detailed documents are in Korean).
Viewstem does not sandbox arbitrary host callbacks. Test only systems and data
you are authorized to use; the sample applications do not grant permission to
test other users' services.

Community conduct reports use the separate process in the
[Code of Conduct](CODE_OF_CONDUCT.md).
