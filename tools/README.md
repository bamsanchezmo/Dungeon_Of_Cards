# Local tools

## Icon sheet slicer

Run:

```powershell
py -m pip install pillow
py tools\icon_sheet_slicer.py
```

If `py` is not available, run it with any Python that has Pillow installed.

Use it to:

- Add one or more icon sheet images.
- Click vertical guide lines, then horizontal guide lines.
- Or use **Even grid...** for a quick starting grid.
- Click **Detect boxes** to find icon edges from brightness.
- Toggle **Normalize to average detected size** if you want all exports resized to the average detected icon size.
- Enter one export name per icon in the side panel.
- Export the selected sheet or all sheets into an output subfolder.

The tool saves a `.slicer.json` sidecar next to each source image so guide lines and filename lists reload later.
