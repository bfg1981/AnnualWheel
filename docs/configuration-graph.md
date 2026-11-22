# Plan graph

The plan JSON has two objects. `settings` holds the organisation, display preferences and translations. `graph` contains the scheduling model, in the order `layers`, `nodes`, `edges`. Every node has a unique string ID. Each edge names a source, a target and a relation. Declare nodes in display order within each category. Edges can refer to any declared node, including a deadline that appears later in the list.

For example, add these entries to the graph to put a review seven days after the end of February. The same edge works in leap years.

```json
{
  "layers": [
    { "id": "layer:events", "label": "Events", "color": "#c93d3d", "defaultFor": ["event"] }
  ],
  "nodes": [
    { "id": "date:february-close", "date": { "kind": "month_end", "month": 2 } },
    { "id": "item:review", "title": "Review", "kind": "event", "layer": "auto", "status": "derived" }
  ],
  "edges": [
    { "from": "date:february-close", "to": "item:review", "type": "offset", "days": 7 }
  ]
}
```

The complete [minimal plan](../examples/minimal.json) includes the required initial node and a display layer.

| Node ID | Contents |
| --- | --- |
| `initial` | The start-of-year date, with its initial year and optional rule text. |
| `item:<id>` | A deadline, event or course. Fixed dates can be written directly as `"schedule": { "kind": "fixed", "month": 12, "day": 24 }`. |
| `group:<id>` | Common date, defaults and collapsed state. Members inherit defaults and store their own overrides. |
| `date:<id>` | A reusable annual date or month boundary. |
| `anchor:<id>` | A named, optionally adjustable date with an incoming default, comparison or offset. |
| `constraint:<id>` | A shared condition such as a weekday or calendar membership. |
| `calendar:<id>` | A calendar reference, inline definition or composite. The catalog resolves external sources during the build. |

Read a date edge from prerequisite to dependent. For example, `{"from":"A","to":"B","type":"less_or_equal"}` means B is due on or before A. Comparisons accept `offsetDays` or `offsetMonths`. An `offset` edge accepts signed `days` or `weeks`, with optional `whole` for weeks. Other date relations include `default_date`, `same_day`, weekday recurrences and `course`. An edge from a course can select its `start` or `end` endpoint.

A `member` edge runs from group to member. A `satisfies` edge runs from constraint to deadline. A `calendar` edge supplies a calendar to a constraint, and an `includes` edge runs from a component calendar to its composite. Declare layers in legend order in `graph.layers`. Each layer has an ID, label and colour. Its optional `defaultFor` array lists the item kinds that use it when their layer is `"auto"`. A `layer` edge from the layer ID assigns that layer explicitly.

Both build commands also accept older plans with an `items` list. The editor downloads `annual-wheel.json` and sends the same settings and graph on save. Existing YAML plan files can still be used as build inputs.
