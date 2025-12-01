# app.py  — Improved GearMatrix Pro backend
import os
import json
import csv
import time
import logging
from pathlib import Path
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from collections import deque, defaultdict
from io import StringIO

# -------------------- CONFIG --------------------
BASE_DIR = Path(__file__).parent
SAVED_DIR = BASE_DIR / "saved_sets"
SAVED_DIR.mkdir(exist_ok=True)

app = Flask(__name__, static_folder="static", static_url_path="/")
CORS(app)

# Set up logging to stdout so Railway shows logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gearmatrix")

# Default mesh efficiency (fraction)
DEFAULT_MESH_EFF = 0.98

# Valid transitions for quick compatibility checks
VALID_TRANSITIONS = {
    "Spur": ["Spur", "Helical", "Rack", "Internal"],
    "Helical": ["Spur", "Helical", "Rack", "Internal"],
    "Bevel": ["Bevel", "Miter", "Spiral Bevel"],
    "Miter": ["Bevel", "Miter"],
    "Spiral Bevel": ["Bevel", "Spiral Bevel"],
    "Worm": ["Spur"],
    "Rack": [],
    "Internal": ["Spur", "Helical"]
}

# Unit conversions (to internal units: mm for length, Nm for torque)
UNIT_CONVERSIONS = {
    "length": {"mm": 1.0, "cm": 10.0, "m": 1000.0, "inch": 25.4, "ft": 304.8},
    "torque": {"Nm": 1.0, "kgm": 9.80665, "lbf-ft": 1.35582, "lbf-in": 0.1129848}
}

# Basic in-memory rate limiter (very small, per IP)
RATE_LIMIT = {"calls": 30, "window": 60}  # 30 calls / 60s per IP
_rate_store = defaultdict(lambda: {"ts": time.time(), "count": 0})

# -------------------- UTILITIES --------------------
def rate_limited(func):
    @wraps(func)
    def inner(*a, **k):
        ip = request.remote_addr or "unknown"
        entry = _rate_store[ip]
        now = time.time()
        if now - entry["ts"] > RATE_LIMIT["window"]:
            entry["ts"] = now
            entry["count"] = 0
        entry["count"] += 1
        if entry["count"] > RATE_LIMIT["calls"]:
            return jsonify({"error": "Rate limit exceeded"}), 429
        return func(*a, **k)
    return inner

def teeth_ratio_to_rpm(rpm_in, t_in, t_out):
    return rpm_in * (t_in / t_out) if t_out != 0 else 0.0

def teeth_ratio_to_torque(torque_in, t_in, t_out):
    return torque_in * (t_out / t_in) if t_in != 0 else 0.0

def opposite_direction(type_a, type_b):
    # internal gear preserves direction; worm flips; others flip by default
    if type_a == "Internal" or type_b == "Internal":
        return False
    if type_a == "Worm" or type_b == "Worm":
        return True
    return True

def has_cycle(graph):
    visited = set()
    rec = set()
    def visit(n):
        visited.add(n); rec.add(n)
        for nb in graph.get(n, []):
            if nb not in visited:
                if visit(nb): return True
            elif nb in rec:
                return True
        rec.remove(n); return False
    for node in graph:
        if node not in visited:
            if visit(node): return True
    return False

def convert_length_to_mm(value, unit):
    try:
        return float(value) * UNIT_CONVERSIONS["length"].get(unit, 1.0)
    except Exception:
        raise ValueError(f"Invalid length value/unit: {value} {unit}")

def convert_torque_to_nm(value, unit):
    try:
        return float(value) * UNIT_CONVERSIONS["torque"].get(unit, 1.0)
    except Exception:
        raise ValueError(f"Invalid torque value/unit: {value} {unit}")

# -------------------- STATIC ROUTES --------------------
@app.route("/")
def homepage():
    return send_from_directory("static", "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory("static", filename)

# -------------------- API: calculation --------------------
@app.route("/api/calc", methods=["POST"])
@rate_limited
def api_calc():
    try:
        payload = request.get_json(force=True)
        # Read inputs with defaults and validation
        unit = payload.get("unit", "mm")
        torque_unit = payload.get("torque_unit", "Nm")
        rpm_input = float(payload.get("rpm_input", 0.0))
        torque_input_raw = payload.get("torque_input", 0.0)
        gears_in = payload.get("gears", [])

        if not isinstance(gears_in, list) or len(gears_in) == 0:
            return jsonify({"error": "gears must be a non-empty list"}), 400

        # Convert torque to Nm internally
        torque_input = convert_torque_to_nm(torque_input_raw, torque_unit)

        # Build gear_data & graph
        gear_data = {}
        graph = {}
        compatibility_warnings = []
        for i, g in enumerate(gears_in):
            try:
                gtype = g.get("type", "Spur")
                teeth = int(g.get("teeth", 0))
                radius_user = float(g.get("radius", 0.0))
                radius_mm = convert_length_to_mm(radius_user, unit)
                module = g.get("module", None)
                if module in (None, "", 0):
                    # fallback compute module = radius_user / teeth (user units) if teeth>0
                    module_val = (radius_user / teeth) if teeth else 0.0
                else:
                    module_val = float(module)
                connects_raw = g.get("connects", "")
                connects = [int(x) for x in str(connects_raw).split(",") if x.strip().isdigit()]
                mesh_eff = g.get("mesh_eff", None)
                mesh_eff_pct = float(mesh_eff) / 100.0 if mesh_eff not in (None, "") else DEFAULT_MESH_EFF
                if not (0.0 < mesh_eff_pct <= 2.0):
                    # sanity check
                    mesh_eff_pct = DEFAULT_MESH_EFF

                gear_data[i] = {
                    "type": gtype, "teeth": teeth,
                    "radius_mm": radius_mm, "module": float(module_val),
                    "rpm": None, "torque": None, "dir": None
                }
                graph[i] = connects
            except Exception as ex:
                return jsonify({"error": f"Invalid gear input at index {i}: {ex}"}), 400

        # Compatibility scan
        for a, conns in graph.items():
            for b in conns:
                ta = gear_data[a]["type"]
                tb = gear_data[b]["type"]
                allowed = (tb in VALID_TRANSITIONS.get(ta, [])) or (ta in VALID_TRANSITIONS.get(tb, []))
                if not allowed:
                    compatibility_warnings.append(f"Incompatible: Gear {a} ({ta}) ↔ Gear {b} ({tb})")

        # cycle check
        if has_cycle(graph):
            return jsonify({"error": "Cycle detected in gear graph"}), 400

        # BFS traversal from gear 0
        if 0 not in gear_data:
            return jsonify({"error": "Gear 0 (input) not present"}), 400

        gear_data[0]["rpm"] = rpm_input
        gear_data[0]["torque"] = torque_input
        gear_data[0]["dir"] = 1  # CW default

        q = deque([0])
        visited = set([0])
        results = []
        # store per-edge mesh eff if user provided "connections" object; fallback to driving gear mesh_eff
        # We accept optional "edges" in payload: [{"from":0,"to":1,"mesh_eff":98}, ...]
        edge_mesh_map = {}
        for e in payload.get("edges", []):
            try:
                edge_mesh_map[(int(e["from"]), int(e["to"]))] = float(e.get("mesh_eff", DEFAULT_MESH_EFF*100))/100.0
            except:
                pass

        while q:
            node = q.popleft()
            base = gear_data[node]
            for nbr in graph.get(node, []):
                if gear_data[nbr]["rpm"] is not None:
                    # merging: preserve first-writer (documented behavior)
                    continue

                t1 = base["teeth"]
                t2 = gear_data[nbr]["teeth"]
                if t1 == 0 or t2 == 0:
                    return jsonify({"error": f"Zero teeth on gear {node} or {nbr}"}), 400

                rpm_n = teeth_ratio_to_rpm(base["rpm"], t1, t2)
                torque_n = teeth_ratio_to_torque(base["torque"], t1, t2)

                # choose mesh eff: edge-specific > driving gear mesh_eff > default
                edge_eff = edge_mesh_map.get((node, nbr), None)
                if edge_eff is None:
                    # try gear-specified field if present
                    try:
                        ge = gears_in[node].get("mesh_eff", None)
                        edge_eff = float(ge)/100.0 if ge not in (None, "") else DEFAULT_MESH_EFF
                    except:
                        edge_eff = DEFAULT_MESH_EFF

                # apply mesh losses to torque (rpm remains kinematic)
                torque_n *= edge_eff

                # determine rotation direction
                invert = opposite_direction(gear_data[node]["type"], gear_data[nbr]["type"])
                dir_n = -base["dir"] if invert else base["dir"]

                gear_data[nbr]["rpm"] = rpm_n
                gear_data[nbr]["torque"] = torque_n
                gear_data[nbr]["dir"] = dir_n

                results.append({
                    "from": node, "to": nbr, "rpm": rpm_n, "torque": torque_n, "mesh_eff": edge_eff,
                    "direction": "CW" if dir_n > 0 else "CCW"
                })
                visited.add(nbr)
                q.append(nbr)

        # build readable gear_states and module summary (convert radius back to user unit)
        gear_states = {}
        module_summary = []
        for i, d in gear_data.items():
            radius_user = d["radius_mm"] / UNIT_CONVERSIONS["length"].get(unit, 1.0)
            gear_states[i] = {"rpm": d["rpm"], "torque": d["torque"], "dir": ("CW" if (d.get("dir",1) > 0) else "CCW")}
            module_summary.append({
                "gear": i, "module": d["module"], "radius_user": radius_user, "radius_unit": unit, "teeth": d["teeth"]
            })

        resp = {
            "results": results,
            "gear_states": gear_states,
            "module_summary": module_summary,
            "warnings": compatibility_warnings
        }

        logger.info(f"/api/calc success: gears={len(gears_in)}; results={len(results)}")
        return jsonify(resp)

    except Exception as e:
        logger.exception("calc error")
        return jsonify({"error": str(e)}), 500

# -------------------- API: save & load gear sets --------------------
@app.route("/api/save-set", methods=["POST"])
@rate_limited
def api_save_set():
    try:
        payload = request.get_json(force=True)
        name = payload.get("name", f"set_{int(time.time())}")
        safe_name = "".join(c for c in name if c.isalnum() or c in ("-", "_")).strip()
        filename = SAVED_DIR / f"{safe_name}.json"
        with open(filename, "w") as f:
            json.dump(payload, f, indent=2)
        logger.info(f"Saved set {filename}")
        return jsonify({"saved": True, "filename": filename.name})
    except Exception as e:
        logger.exception("save-set error")
        return jsonify({"error": str(e)}), 500

@app.route("/api/list-sets", methods=["GET"])
def api_list_sets():
    files = [p.name for p in SAVED_DIR.glob("*.json")]
    return jsonify({"sets": files})

@app.route("/api/load-set/<name>", methods=["GET"])
def api_load_set(name):
    try:
        path = SAVED_DIR / name
        if not path.exists():
            return jsonify({"error": "not found"}), 404
        with open(path, "r") as f:
            payload = json.load(f)
        return jsonify(payload)
    except Exception as e:
        logger.exception("load-set error")
        return jsonify({"error": str(e)}), 500

# -------------------- API: export CSV of last calculation --------------------
# This endpoint expects a POST with last_result same format as API response to convert to CSV
@app.route("/api/export-csv", methods=["POST"])
@rate_limited
def api_export_csv():
    try:
        payload = request.get_json(force=True)
        results = payload.get("results", [])
        gear_states = payload.get("gear_states", {})

        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["from", "to", "rpm", "torque", "mesh_eff", "direction"])
        for r in results:
            writer.writerow([r.get("from"), r.get("to"), r.get("rpm"), r.get("torque"), r.get("mesh_eff"), r.get("direction")])

        writer.writerow([])
        writer.writerow(["gear", "rpm", "torque", "direction"])
        for i, s in sorted(gear_states.items(), key=lambda x: int(x[0])):
            writer.writerow([i, s.get("rpm"), s.get("torque"), s.get("dir")])

        output.seek(0)
        csv_bytes = output.getvalue().encode("utf-8")
        fname = f"gearmatrix_export_{int(time.time())}.csv"
        return send_file(
            StringIO(output.getvalue()),
            mimetype="text/csv",
            as_attachment=True,
            download_name=fname
        )
    except Exception as e:
        logger.exception("export-csv error")
        return jsonify({"error": str(e)}), 500

# -------------------- START --------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    logger.info(f"Starting GearMatrix Pro backend on port {port}")
    app.run(host="0.0.0.0", port=port)
