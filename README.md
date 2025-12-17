# Eqlize Web Demo

This repository is a small web demo showcasing [Eqlize](https://github.com/jcuenod/eqlize) — an EdgeQL-to-SQL compiler that lets you write EdgeQL queries against existing SQL databases that have relations defined in the schema (e.g., with foreign keys). The interactive demo runs entirely in the browser and demonstrates example queries and UI integration.

## What this Demo Shows

This demo demonstrates how Eqlize translates EdgeQL queries into SQL that can run against an existing SQLite database. It includes enough toy data to show how eqlize compiles EdgeQL queries that cane traverse relations, filter, and aggregate data.

## Why Eqlize Is Interesting

- **Write expressive queries against existing databases:** Eqlize is only interesting if EdgeQL is interesting. I think EdgeQL is interesting because it provides concise, readable syntax for selecting fields, traversing relationships, and expressing aggregates. Eqlize brings that expressiveness to standard SQL databases without migrating to EdgeDB. So you can use it against sqlite (or, perhaps, some OLAP DB if you write an adaptor...)
- **Automatic relationship handling:** Eqlize introspects your schema and generates the appropriate JOINs and subqueries, making nested queries and relationship traversal feel natural.
- **Filtered aggregates and group-by made easier:** EdgeQL's aggregation and filter semantics are more ergonomic than equivalent raw SQL; Eqlize compiles those patterns into (aspirationally) efficient SQL.

## Learn More and Resources

- **EdgeQL (EdgeDB / Gel) docs:** The official Gel (formerly EdgeDB) documentation is the best place to learn EdgeQL syntax and concepts. Eqlize is trying to figure out how to follow EdgeQL, while being DB independent. https://www.geldata.com/
- **Eqlize code, documentation, and tests:** Look at the project's tests and example translations to see concrete EdgeQL-to-SQL output and confirmed behavior.https://github.com/jcuenod/eqlize

