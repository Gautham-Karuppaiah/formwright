PROJECTS IN DEPTH:

Floor-Plan Fixture Counter (Halcyon Byteworks, 2026): counting fixtures on floor plans by hand took about 45
minutes a sheet. The counter matches the vector outline of a marked fixture at any rotation and counts a sheet in
about 4 minutes, with 99% of fixtures found. Sheets render as tiles off the UI thread. A browser version runs in
React and TypeScript with rendering in a WebAssembly worker.

Price List Sorter (Halcyon Byteworks, 2026): reads supplier price lists from CSVs and PDFs, matches items across
suppliers by model number and flags price changes between versions.
