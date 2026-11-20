# Configuration saving

The editor uses one same-origin endpoint, `/api/config`, for the plan served by the deployment. A static deployment can omit it entirely.

| Request | Expected response |
| --- | --- |
| `OPTIONS /api/config`, empty body | A successful status with `Allow: OPTIONS, POST` advertises saving. |
| `POST /api/config`, `Content-Type: application/json` | Return `204 No Content` after saving the full configuration. |

The POST body is the same plan object as the YAML configuration download, encoded directly as JSON. It uses source-language strings and includes the confirmed edits. All interface languages use the same endpoint.

Requests use the browser's existing same-origin credentials. The backend must authorize the writer on each POST, validate the configuration, and replace the stored plan atomically. Return `401` when authentication is required or `403` when the user lacks permission. For cookie-based authentication, the backend should also verify the request origin.

The first confirmation with an actual configuration change probes the endpoint. Confirming unchanged values or reverting an edit before confirmation sends no request. After a successful save, the saved configuration becomes the new baseline. A missing route, unsupported method, or successful probe without POST in `Allow` switches the page to session-only editing with one warning. Other failures leave the edits in the tab and allow another save attempt while changes are pending.
