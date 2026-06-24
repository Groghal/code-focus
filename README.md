# Code Focus

Code Focus (`code-focus`) is a VS Code extension that improves code readability for humans. It opens a focused presenter view with stable typography, high-contrast colors, hidden line-number noise, and predictable page movement.

The presenter shows:

- full file path in the header
- shown line range in the header
- controlled high-contrast code rendering
- no inline/gutter line numbers in the code viewport
- `WR>` prefixes for continuation rows when a long physical source line is visually wrapped
- `BR>` prefixes for empty/whitespace-only source lines so they count as one line
- `S{number}>` prefixes for leading indentation, where the number is the count of leading spaces to restore

Example header:

```text
/home/grog/projects/demo/src/index.ts
shown lines: 12-48
```

Wrapped-line contract:

```text
const value = veryLongExpressionPartOne + veryLongExpressionPartTwo +
WR> veryLongExpressionPartThree;
BR>
S2>return value;
```

The presenter reconnects `WR>` rows visually to the previous code row, keeps each `BR>` row as one visible blank source line, and shows `S{number}>` rows with their intended leading-space count. Page movement is budgeted by rendered rows: `WR>` continuations and `BR>` rows each consume one visible row, and a source line is not shown on a slide unless all of its rendered rows fit. The header line range gives humans a stable reading position while visible per-line numbers stay hidden.

## Command

- `Code Focus: Show Panel`

Use Space and Shift+Space inside the panel to move by one fully visible screen with no repeated overlap lines. Holding Space is allowed; page/slide movement is paced by the extension host at one accepted move every 300ms with at most one pending move kept during cooldown, so held keys do not burst or drop the whole hold sequence.

## Development

```bash
npm install
npm run build
npm test
```

## Debug in VS Code

Use the checked-in folder-local debug configuration. Open the `code-focus/` folder directly:

```bash
cd /path/to/repo/code-focus
code .
```

Install dependencies once:

```bash
npm install
```

Then:

1. Open the Run and Debug view.
2. Select **Debug Code Focus**.
3. Press **F5**. VS Code runs the `build-code-focus` task and opens a second **Extension Development Host** window.
4. In the second window, open a project folder or file.
5. Run this exact command from the Command Palette:

   ```text
   Code Focus: Show Panel
   ```

Put breakpoints in `src/extension.ts` or other `src/**/*.ts` files. Re-run **F5** after code changes, or run this in a terminal while debugging:

```bash
npm run watch
```

Troubleshooting `command not found`:

- Make sure you pressed **F5** with **Debug Code Focus** selected, not a generic Node/debug configuration.
- Make sure the second window title says **Extension Development Host**.
- In the second window, run **Developer: Show Running Extensions** and confirm **Code Focus** is listed.
- If Code Focus is not listed, close the second window, reopen the `code-focus/` folder with `code .`, and run **Debug Code Focus** again.
- If the command appears in the first window but not the second, you are running it in the wrong VS Code window.
