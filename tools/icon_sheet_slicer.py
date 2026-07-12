"""
Local icon-sheet slicer GUI.

Run:
    python tools/icon_sheet_slicer.py

If Python is not on PATH, use the Codex bundled Python or install Pillow:
    py -m pip install pillow

What it does:
- Load one or more image sheets.
- Click vertical and horizontal guide lines on the image.
- Uses the image edges plus your clicked guides to make grid cells.
- Detects the bright/object bounds inside each cell.
- Optionally normalizes every exported icon to the average detected size.
- Lets you keep a separate filename list per loaded image.
- Exports named PNGs into a subfolder.
"""

from __future__ import annotations

import json
import math
import re
import tkinter as tk
from dataclasses import dataclass, field
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from PIL import Image, ImageDraw, ImageStat, ImageTk


APP_TITLE = "Dungeon Icon Sheet Slicer"
SIDECAR_SUFFIX = ".slicer.json"


def safe_filename(value: str, index: int) -> str:
    value = value.strip()
    if not value:
        value = f"icon_{index + 1:02d}"
    value = value.replace("&", "and")
    value = re.sub(r"['’]", "", value)
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("._-")
    return (value or f"icon_{index + 1:02d}").lower() + ".png"


def clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


@dataclass
class SheetState:
    path: Path
    image: Image.Image
    vertical_guides: list[int] = field(default_factory=list)
    horizontal_guides: list[int] = field(default_factory=list)
    names_text: str = ""
    detected_boxes: list[tuple[int, int, int, int]] = field(default_factory=list)

    @property
    def sidecar_path(self) -> Path:
        return self.path.with_suffix(self.path.suffix + SIDECAR_SUFFIX)

    def load_sidecar(self) -> None:
        if not self.sidecar_path.exists():
            return
        try:
            data = json.loads(self.sidecar_path.read_text(encoding="utf-8"))
        except Exception:
            return
        w, h = self.image.size
        self.vertical_guides = sorted({clamp(int(x), 1, w - 1) for x in data.get("vertical_guides", [])})
        self.horizontal_guides = sorted({clamp(int(y), 1, h - 1) for y in data.get("horizontal_guides", [])})
        self.names_text = str(data.get("names_text", ""))

    def save_sidecar(self) -> None:
        data = {
            "image": str(self.path),
            "vertical_guides": self.vertical_guides,
            "horizontal_guides": self.horizontal_guides,
            "names_text": self.names_text,
        }
        self.sidecar_path.write_text(json.dumps(data, indent=2), encoding="utf-8")


class IconSheetSlicer(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("1320x860")
        self.minsize(980, 640)

        self.sheets: list[SheetState] = []
        self.current_index = -1
        self.mode = tk.StringVar(value="select")
        self.normalize_average = tk.BooleanVar(value=True)
        self.threshold_delta = tk.IntVar(value=28)
        self.min_brightness = tk.IntVar(value=40)
        self.padding_px = tk.IntVar(value=8)
        self.output_folder_name = tk.StringVar(value="exported_icons")
        self.preview_scale = 1.0
        self.tk_image: ImageTk.PhotoImage | None = None

        self._build_ui()

    @property
    def sheet(self) -> SheetState | None:
        if 0 <= self.current_index < len(self.sheets):
            return self.sheets[self.current_index]
        return None

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.columnconfigure(1, weight=0)
        self.rowconfigure(0, weight=1)

        left = ttk.Frame(self)
        left.grid(row=0, column=0, sticky="nsew")
        left.rowconfigure(1, weight=1)
        left.columnconfigure(0, weight=1)

        toolbar = ttk.Frame(left, padding=6)
        toolbar.grid(row=0, column=0, sticky="ew")
        ttk.Button(toolbar, text="Add images", command=self.add_images).pack(side="left")
        ttk.Button(toolbar, text="Save sidecar", command=self.save_current_sidecar).pack(side="left", padx=(6, 0))
        ttk.Button(toolbar, text="Detect boxes", command=self.detect_boxes).pack(side="left", padx=(12, 0))
        ttk.Button(toolbar, text="Export current", command=self.export_current).pack(side="left", padx=(6, 0))
        ttk.Button(toolbar, text="Export all", command=self.export_all).pack(side="left", padx=(6, 0))
        ttk.Label(toolbar, text="Click mode:").pack(side="left", padx=(18, 4))
        ttk.Radiobutton(toolbar, text="Vertical", variable=self.mode, value="vertical").pack(side="left")
        ttk.Radiobutton(toolbar, text="Horizontal", variable=self.mode, value="horizontal").pack(side="left")
        ttk.Radiobutton(toolbar, text="Erase nearest", variable=self.mode, value="erase").pack(side="left")

        canvas_frame = ttk.Frame(left)
        canvas_frame.grid(row=1, column=0, sticky="nsew")
        canvas_frame.rowconfigure(0, weight=1)
        canvas_frame.columnconfigure(0, weight=1)

        self.canvas = tk.Canvas(canvas_frame, bg="#111018", highlightthickness=0)
        self.canvas.grid(row=0, column=0, sticky="nsew")
        self.canvas.bind("<Button-1>", self.on_canvas_click)
        self.canvas.bind("<Configure>", lambda _e: self.redraw())

        right = ttk.Frame(self, padding=10)
        right.grid(row=0, column=1, sticky="ns")
        right.columnconfigure(0, weight=1)

        ttk.Label(right, text="Images").grid(row=0, column=0, sticky="w")
        self.image_list = tk.Listbox(right, width=38, height=8, exportselection=False)
        self.image_list.grid(row=1, column=0, sticky="ew")
        self.image_list.bind("<<ListboxSelect>>", self.on_select_sheet)

        guide_box = ttk.LabelFrame(right, text="Guides", padding=8)
        guide_box.grid(row=2, column=0, sticky="ew", pady=(10, 0))
        ttk.Button(guide_box, text="Clear vertical", command=lambda: self.clear_guides("vertical")).grid(row=0, column=0, sticky="ew")
        ttk.Button(guide_box, text="Clear horizontal", command=lambda: self.clear_guides("horizontal")).grid(row=0, column=1, sticky="ew", padx=(6, 0))
        ttk.Button(guide_box, text="Even grid...", command=self.even_grid_dialog).grid(row=1, column=0, columnspan=2, sticky="ew", pady=(6, 0))
        self.guide_label = ttk.Label(guide_box, text="V: 0  H: 0")
        self.guide_label.grid(row=2, column=0, columnspan=2, sticky="w", pady=(6, 0))

        settings = ttk.LabelFrame(right, text="Detection / Export", padding=8)
        settings.grid(row=3, column=0, sticky="ew", pady=(10, 0))
        self._spin(settings, "Brightness delta", self.threshold_delta, 0, 120, 0)
        self._spin(settings, "Min brightness", self.min_brightness, 0, 255, 1)
        self._spin(settings, "Padding px", self.padding_px, 0, 80, 2)
        ttk.Checkbutton(settings, text="Normalize to average detected size", variable=self.normalize_average).grid(row=3, column=0, columnspan=2, sticky="w", pady=(6, 0))
        ttk.Label(settings, text="Output subfolder").grid(row=4, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(settings, textvariable=self.output_folder_name, width=24).grid(row=4, column=1, sticky="ew", pady=(8, 0))

        ttk.Label(right, text="Filename list for selected image").grid(row=4, column=0, sticky="w", pady=(12, 0))
        self.names = tk.Text(right, width=38, height=20, wrap="none")
        self.names.grid(row=5, column=0, sticky="nsew")
        self.names.bind("<KeyRelease>", lambda _e: self.store_names_text())
        ttk.Label(right, text="One filename/name per detected icon, in reading order.\nNames are sanitized to .png on export.").grid(row=6, column=0, sticky="w", pady=(6, 0))

        self.status = tk.StringVar(value="Add an image sheet to begin.")
        ttk.Label(right, textvariable=self.status, wraplength=300).grid(row=7, column=0, sticky="ew", pady=(12, 0))

    def _spin(self, parent: ttk.Frame, label: str, var: tk.IntVar, lo: int, hi: int, row: int) -> None:
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w")
        ttk.Spinbox(parent, from_=lo, to=hi, textvariable=var, width=8, command=self.redraw).grid(row=row, column=1, sticky="e")

    def add_images(self) -> None:
        paths = filedialog.askopenfilenames(
            title="Choose icon sheet images",
            filetypes=[("Images", "*.png *.jpg *.jpeg *.webp *.bmp"), ("All files", "*.*")],
        )
        for p in paths:
            path = Path(p)
            try:
                image = Image.open(path).convert("RGBA")
            except Exception as exc:
                messagebox.showerror(APP_TITLE, f"Could not open {path.name}:\n{exc}")
                continue
            state = SheetState(path=path, image=image)
            state.load_sidecar()
            self.sheets.append(state)
            self.image_list.insert("end", path.name)
        if self.current_index < 0 and self.sheets:
            self.current_index = 0
            self.image_list.selection_set(0)
            self.load_current_into_panel()
        self.redraw()

    def on_select_sheet(self, _event: tk.Event) -> None:
        selection = self.image_list.curselection()
        if not selection:
            return
        self.store_names_text()
        self.current_index = int(selection[0])
        self.load_current_into_panel()
        self.redraw()

    def load_current_into_panel(self) -> None:
        sheet = self.sheet
        self.names.delete("1.0", "end")
        if sheet:
            self.names.insert("1.0", sheet.names_text)
            self.status.set(f"Loaded {sheet.path.name} ({sheet.image.width}x{sheet.image.height})")
        self.update_guide_label()

    def store_names_text(self) -> None:
        if self.sheet:
            self.sheet.names_text = self.names.get("1.0", "end").strip()

    def save_current_sidecar(self) -> None:
        self.store_names_text()
        if not self.sheet:
            return
        self.sheet.save_sidecar()
        self.status.set(f"Saved {self.sheet.sidecar_path.name}")

    def on_canvas_click(self, event: tk.Event) -> None:
        sheet = self.sheet
        if not sheet:
            return
        ix, iy = self.canvas_to_image(event.x, event.y)
        if ix is None or iy is None:
            return
        mode = self.mode.get()
        if mode == "vertical":
            sheet.vertical_guides.append(clamp(ix, 1, sheet.image.width - 1))
            sheet.vertical_guides = sorted(set(sheet.vertical_guides))
        elif mode == "horizontal":
            sheet.horizontal_guides.append(clamp(iy, 1, sheet.image.height - 1))
            sheet.horizontal_guides = sorted(set(sheet.horizontal_guides))
        elif mode == "erase":
            self.erase_nearest_guide(ix, iy)
        self.update_guide_label()
        self.redraw()

    def erase_nearest_guide(self, ix: int, iy: int) -> None:
        sheet = self.sheet
        if not sheet:
            return
        candidates: list[tuple[int, str, int]] = []
        candidates += [(abs(ix - x), "v", x) for x in sheet.vertical_guides]
        candidates += [(abs(iy - y), "h", y) for y in sheet.horizontal_guides]
        if not candidates:
            return
        dist, kind, value = min(candidates, key=lambda t: t[0])
        if dist > 40:
            return
        if kind == "v":
            sheet.vertical_guides.remove(value)
        else:
            sheet.horizontal_guides.remove(value)

    def clear_guides(self, kind: str) -> None:
        if not self.sheet:
            return
        if kind == "vertical":
            self.sheet.vertical_guides.clear()
        else:
            self.sheet.horizontal_guides.clear()
        self.sheet.detected_boxes.clear()
        self.update_guide_label()
        self.redraw()

    def even_grid_dialog(self) -> None:
        sheet = self.sheet
        if not sheet:
            return
        dialog = tk.Toplevel(self)
        dialog.title("Create even grid")
        dialog.transient(self)
        dialog.grab_set()
        cols = tk.IntVar(value=max(1, len(sheet.vertical_guides) + 1))
        rows = tk.IntVar(value=max(1, len(sheet.horizontal_guides) + 1))
        ttk.Label(dialog, text="Columns").grid(row=0, column=0, padx=10, pady=8)
        ttk.Spinbox(dialog, from_=1, to=32, textvariable=cols, width=8).grid(row=0, column=1, padx=10, pady=8)
        ttk.Label(dialog, text="Rows").grid(row=1, column=0, padx=10, pady=8)
        ttk.Spinbox(dialog, from_=1, to=32, textvariable=rows, width=8).grid(row=1, column=1, padx=10, pady=8)

        def apply() -> None:
            c, r = max(1, cols.get()), max(1, rows.get())
            sheet.vertical_guides = [round(sheet.image.width * i / c) for i in range(1, c)]
            sheet.horizontal_guides = [round(sheet.image.height * i / r) for i in range(1, r)]
            self.update_guide_label()
            self.redraw()
            dialog.destroy()

        ttk.Button(dialog, text="Apply", command=apply).grid(row=2, column=0, columnspan=2, sticky="ew", padx=10, pady=10)

    def grid_cells(self, sheet: SheetState) -> list[tuple[int, int, int, int]]:
        xs = [0, *sorted(sheet.vertical_guides), sheet.image.width]
        ys = [0, *sorted(sheet.horizontal_guides), sheet.image.height]
        cells: list[tuple[int, int, int, int]] = []
        for y1, y2 in zip(ys, ys[1:]):
            for x1, x2 in zip(xs, xs[1:]):
                if x2 - x1 > 4 and y2 - y1 > 4:
                    cells.append((x1, y1, x2, y2))
        return cells

    def detect_boxes(self) -> None:
        sheet = self.sheet
        if not sheet:
            return
        boxes = [self.detect_box_in_cell(sheet.image, cell) for cell in self.grid_cells(sheet)]
        sheet.detected_boxes = boxes
        self.status.set(f"Detected {len(boxes)} icon boxes.")
        self.redraw()

    def detect_box_in_cell(self, image: Image.Image, cell: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
        x1, y1, x2, y2 = cell
        crop = image.crop(cell).convert("RGB")
        gray = crop.convert("L")
        stat = ImageStat.Stat(gray)
        threshold = max(self.min_brightness.get(), int(stat.median[0] + self.threshold_delta.get()))
        w, h = gray.size
        pix = gray.load()
        xs: list[int] = []
        ys: list[int] = []
        for y in range(h):
            row_hits = 0
            for x in range(w):
                if pix[x, y] >= threshold:
                    row_hits += 1
            if row_hits >= max(2, w // 80):
                ys.append(y)
        for x in range(w):
            col_hits = 0
            for y in range(h):
                if pix[x, y] >= threshold:
                    col_hits += 1
            if col_hits >= max(2, h // 80):
                xs.append(x)
        pad = self.padding_px.get()
        if not xs or not ys:
            return cell
        bx1 = clamp(x1 + min(xs) - pad, x1, x2 - 1)
        by1 = clamp(y1 + min(ys) - pad, y1, y2 - 1)
        bx2 = clamp(x1 + max(xs) + 1 + pad, bx1 + 1, x2)
        by2 = clamp(y1 + max(ys) + 1 + pad, by1 + 1, y2)
        return (bx1, by1, bx2, by2)

    def export_current(self) -> None:
        if not self.sheet:
            return
        self.export_sheet(self.sheet)

    def export_all(self) -> None:
        if not self.sheets:
            return
        for sheet in self.sheets:
            self.export_sheet(sheet)
        self.status.set(f"Exported all {len(self.sheets)} sheets.")

    def export_sheet(self, sheet: SheetState) -> None:
        self.store_names_text()
        if not sheet.detected_boxes:
            sheet.detected_boxes = [self.detect_box_in_cell(sheet.image, cell) for cell in self.grid_cells(sheet)]
        names = [line.strip() for line in sheet.names_text.splitlines() if line.strip()]
        out_dir = sheet.path.parent / (self.output_folder_name.get().strip() or "exported_icons")
        out_dir.mkdir(parents=True, exist_ok=True)
        boxes = sheet.detected_boxes
        if not boxes:
            messagebox.showwarning(APP_TITLE, "No boxes to export. Add guides first.")
            return
        target_size = None
        if self.normalize_average.get():
            avg_w = max(1, round(sum(b[2] - b[0] for b in boxes) / len(boxes)))
            avg_h = max(1, round(sum(b[3] - b[1] for b in boxes) / len(boxes)))
            target_size = (avg_w, avg_h)
        for i, box in enumerate(boxes):
            crop = sheet.image.crop(box).convert("RGBA")
            if target_size:
                crop = crop.resize(target_size, Image.Resampling.LANCZOS)
            filename = safe_filename(names[i] if i < len(names) else "", i)
            crop.save(out_dir / filename)
        sheet.save_sidecar()
        self.status.set(f"Exported {len(boxes)} PNGs to {out_dir}")

    def redraw(self) -> None:
        self.canvas.delete("all")
        sheet = self.sheet
        if not sheet:
            return
        cw = max(1, self.canvas.winfo_width())
        ch = max(1, self.canvas.winfo_height())
        iw, ih = sheet.image.size
        self.preview_scale = min(cw / iw, ch / ih, 1.0)
        pw, ph = max(1, round(iw * self.preview_scale)), max(1, round(ih * self.preview_scale))
        preview = sheet.image.resize((pw, ph), Image.Resampling.LANCZOS)
        self.tk_image = ImageTk.PhotoImage(preview)
        ox = (cw - pw) // 2
        oy = (ch - ph) // 2
        self.canvas.create_image(ox, oy, image=self.tk_image, anchor="nw", tags=("image",))
        self.canvas_offset = (ox, oy)
        for x in sheet.vertical_guides:
            sx = ox + x * self.preview_scale
            self.canvas.create_line(sx, oy, sx, oy + ph, fill="#59d66f", width=2)
        for y in sheet.horizontal_guides:
            sy = oy + y * self.preview_scale
            self.canvas.create_line(ox, sy, ox + pw, sy, fill="#5fc8ea", width=2)
        for cell in self.grid_cells(sheet):
            self.draw_rect(cell, "#dcb446", dash=(5, 4))
        for box in sheet.detected_boxes:
            self.draw_rect(box, "#ff4e72", width=2)
        self.update_guide_label()

    def draw_rect(self, box: tuple[int, int, int, int], color: str, width: int = 1, dash: tuple[int, int] | None = None) -> None:
        ox, oy = getattr(self, "canvas_offset", (0, 0))
        x1, y1, x2, y2 = box
        s = self.preview_scale
        self.canvas.create_rectangle(ox + x1 * s, oy + y1 * s, ox + x2 * s, oy + y2 * s, outline=color, width=width, dash=dash)

    def canvas_to_image(self, cx: int, cy: int) -> tuple[int | None, int | None]:
        sheet = self.sheet
        if not sheet:
            return None, None
        ox, oy = getattr(self, "canvas_offset", (0, 0))
        ix = round((cx - ox) / self.preview_scale)
        iy = round((cy - oy) / self.preview_scale)
        if ix < 0 or iy < 0 or ix > sheet.image.width or iy > sheet.image.height:
            return None, None
        return ix, iy

    def update_guide_label(self) -> None:
        sheet = self.sheet
        if not sheet:
            self.guide_label.configure(text="V: 0  H: 0")
            return
        self.guide_label.configure(text=f"V: {len(sheet.vertical_guides)}  H: {len(sheet.horizontal_guides)}  Cells: {len(self.grid_cells(sheet))}")


if __name__ == "__main__":
    try:
        IconSheetSlicer().mainloop()
    except ImportError as exc:
        raise SystemExit(f"Missing dependency: {exc}\nInstall Pillow with: py -m pip install pillow")
