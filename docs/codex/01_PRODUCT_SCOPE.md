# Product Scope

## Product vision

Create a personal publishing platform that is straightforward to operate, secure enough for public internet exposure, and enhanced by an AI voice assistant that answers questions from the author's published content.

The project should remain maintainable by one owner. Prefer conventional, documented solutions over unnecessary distributed infrastructure.

## Primary users

- **Visitor**: reads, searches, filters, shares, and asks questions about published content.
- **Administrator/author**: signs in, creates and manages posts, uploads media, previews changes, publishes content, and reviews operational status.
- **Maintainer**: deploys, backs up, restores, audits, and rolls back the system.

## MVP scope

### Public site

- Home page with recent or featured posts.
- Post detail page with readable typography and stable URLs.
- Category and tag navigation.
- Pagination or cursor-based browsing.
- Search across published posts.
- About page and configurable site identity.
- Responsive desktop/mobile layout.
- Light/dark theme with system preference support.
- Accessible keyboard navigation, focus states, form labels, and sufficient contrast.
- SEO metadata: title, description, canonical URL, Open Graph, social card data.
- `sitemap.xml`, `robots.txt`, RSS/Atom feed if consistent with the existing codebase.
- Friendly 404 and error states.

### Administration

- Secure administrator authentication and session handling.
- Post CRUD with draft and published states.
- Slug generation and uniqueness validation.
- Preview before publish.
- Markdown or rich-text editor based on the existing implementation; do not introduce a second editor without a migration plan.
- Category/tag management.
- Media upload and selection.
- Server-side input validation and clear error messages.
- Basic audit fields such as author, created time, updated time, and published time.

### Media

- MVP storage: local filesystem.
- Public path: `/uploads/...`; server directory currently documented as `/var/www/personal-blog/uploads`.
- Validate MIME type, extension, size, and image dimensions where applicable.
- Generate collision-resistant filenames; never trust the uploaded filename as a path.
- Persist metadata such as hash, MIME, byte size, owner, and references.
- Known database table names include `Asset` and `PostAssetRef`; inspect Prisma before changing them.
- Prevent deletion of referenced assets, or use soft deletion/recycle-bin semantics.

### AI assistant

- Text question input available to all supported browsers.
- Optional microphone input after explicit permission.
- Answers grounded in published blog content, with linked sources.
- Optional speech playback of the answer.
- Clear states: idle, listening, transcribing, thinking, speaking, stopped, and error.
- Text fallback when audio permissions or AI services are unavailable.
- Rate limits, usage caps, timeout handling, and privacy notice.

## Later enhancements

- OSS/object storage as primary media storage and off-site backup.
- RAG indexing pipeline with automatic re-indexing on publish/update/unpublish.
- Comments or reactions, only after moderation and abuse controls are defined.
- Scheduled publishing, revisions, and richer editorial workflow.
- Full observability, external alerts, and product analytics with privacy controls.
- PostgreSQL PITR/WAL archiving after storage and recovery requirements are agreed.

## Non-goals for the first milestone

- Multi-tenant blogging platform.
- Arbitrary user registration or public content creation.
- Training a custom foundation model.
- Storing raw voice recordings indefinitely.
- Exposing PostgreSQL, Redis, or the Next.js application port directly to the internet.
- Large infrastructure rewrites before the current repository is audited.

## Product quality gates

A feature is not complete until:

1. server-side validation is implemented;
2. loading, empty, permission-denied, and error states exist;
3. relevant automated checks pass;
4. secrets are not exposed to client code;
5. operational and rollback implications are documented;
6. the feature works through Nginx in the production-like Docker setup.
