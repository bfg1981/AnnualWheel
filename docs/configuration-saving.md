# Configuration saving

The editor uses one same-origin endpoint, `/api/config`, for the plan served by the deployment. A static deployment can omit it entirely.

| Request | Expected response |
| --- | --- |
| `OPTIONS /api/config`, empty body | A successful status with `Allow: OPTIONS, POST` advertises saving. |
| `POST /api/config`, `Content-Type: application/json` | Return `204 No Content` after saving the full configuration. |

The POST body is the same JSON document as the configuration download. It contains both `settings` and `graph`. It uses source-language strings and includes the confirmed edits. All interface languages use the same endpoint.

Requests use the browser's existing same-origin credentials. The backend must authorize the writer on each POST, validate the configuration, and replace the stored plan atomically. Return `401` when authentication is required or `403` when the user lacks permission. For cookie-based authentication, the backend should also verify the request origin.

Entering edit mode probes the endpoint, including when opening the edit URL directly. The read-only graph sends no probe. A missing route, unsupported method, or successful probe without POST in `Allow` produces one warning per tab that edits will last only until the tab is closed or reloaded. The editor caches a definitive probe result. A permission or temporary failure allows a later attempt to retry.

Confirming an actual change sends the plan when saving is supported. Confirming unchanged values or reverting an edit before confirmation sends no POST. After a successful save, the saved configuration becomes the new baseline.
