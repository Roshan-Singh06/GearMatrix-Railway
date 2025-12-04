# app.py
# Serve index from static/html and static assets from static/
from flask import Flask, send_from_directory, jsonify, request, abort, send_file
import os, json, datetime, io, traceback, logging
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import animation
from PIL import Image

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("gearmatrix")

# serve static files from project root (Flask will still serve /static/ folder)
app = Flask(__name__, static_folder='.', static_url_path='')

SAVE_DIR = os.environ.get('SAVED_DIR', 'saved_configs')
os.makedirs(SAVE_DIR, exist_ok=True)

# Serve main UI from static/html/index.html
@app.route('/')
def index():
    # serve static/index.html if exists (common case)
    if os.path.exists(os.path.join('static', 'index.html')):
        return send_from_directory('static', 'index.html')
    if os.path.exists('index.html'):
        return send_from_directory('.', 'index.html')
    return ("index.html not found. Ensure static/index.html or repo root index.html is present."), 500

    # fallback to repo root index.html
    if os.path.exists('index.html'):
        log.info("Serving index.html from repo root")
        return send_from_directory('.', 'index.html')
    log.error("index.html not found (static/html/index.html or repo root)")
    return ("index.html not found. Ensure static/html/index.html or repo root index.html is present."), 500

# Serve any file requested; first try static/ folder then repo root
@app.route('/<path:filename>')
def serve_file_anywhere(filename):
    # If file exists under static/ (eg static/css/style.css), serve that
    static_path = os.path.join('static', filename)
    if os.path.exists(static_path):
        # note: send_from_directory requires dir portion and filename
        dir_part = os.path.dirname(static_path) or '.'
        file_name = os.path.basename(static_path)
        return send_from_directory(dir_part, file_name)
    # else try repo root
    root_path = os.path.join('.', filename)
    if os.path.exists(root_path):
        return send_from_directory('.', filename)
    log.warning(f"File not found: {filename}")
    abort(404)

# health and debug
@app.route('/health')
def health():
    return jsonify({"status":"ok", "time": datetime.datetime.utcnow().isoformat() + "Z"})

@app.route('/__listfiles', methods=['GET'])
def list_files():
    try:
        files = []
        for root, dirs, filenames in os.walk('static'):
            for f in filenames:
                files.append(os.path.relpath(os.path.join(root, f)))
        # also list top-level
        for f in os.listdir('.'):
            if os.path.isfile(f):
                files.append(f)
        return jsonify({"ok": True, "files": sorted(files)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# Save endpoints (unchanged)
@app.route('/save', methods=['POST'])
def save_config():
    try:
        payload = request.get_json(force=True)
    except Exception as e:
        return jsonify({"error": "invalid json", "msg": str(e)}), 400
    timestamp = datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    filename = f'gearmatrix_{timestamp}.json'
    path = os.path.join(SAVE_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2)
    log.info(f"Saved config: {path}")
    return jsonify({"ok": True, "filename": filename})

@app.route('/configs', methods=['GET'])
def list_configs():
    try:
        files = sorted(os.listdir(SAVE_DIR))
        return jsonify({"ok": True, "files": files})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/configs/<path:filename>', methods=['GET'])
def get_config(filename):
    if '..' in filename or filename.startswith('/'):
        abort(400)
    full = os.path.join(SAVE_DIR, filename)
    if not os.path.exists(full):
        return jsonify({"error": "not found"}), 404
    return send_from_directory(SAVE_DIR, filename, as_attachment=True)

# ---------------------------
# Matplotlib endpoints (unchanged)
# ---------------------------
def _png_bytes_from_figure(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    return buf

@app.route('/plot2d', methods=['POST'])
def plot2d():
    try:
        data = request.get_json(force=True)
        if data is None or 'y' not in data:
            return jsonify({"error": "missing json body or 'y' field required"}), 400
        y = np.array(data.get('y', []), dtype=float)
        x = np.array(data.get('x', list(range(len(y)))), dtype=float)
        title = data.get('title', '2D Line Plot')
        xlabel = data.get('xlabel', 'X')
        ylabel = data.get('ylabel', 'Y')
        ls = data.get('line_style', '-')
        marker = data.get('marker', None)

        fig, ax = plt.subplots(figsize=(7,4))
        ax.plot(x, y, linestyle=ls, marker=(marker if marker else None), linewidth=2)
        ax.set_title(title); ax.set_xlabel(xlabel); ax.set_ylabel(ylabel)
        ax.grid(True, linestyle='--', alpha=0.4)
        buf = _png_bytes_from_figure(fig)
        return send_file(buf, mimetype='image/png', download_name='plot2d.png')
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "plot generation failed", "msg": str(e)}), 500

@app.route('/plot3d', methods=['POST'])
def plot3d():
    try:
        data = request.get_json(force=True)
        x = np.array(data.get('x', []), dtype=float)
        y = np.array(data.get('y', []), dtype=float)
        z = np.array(data.get('z', []), dtype=float)
        if x.size == 0 or y.size == 0 or z.size == 0:
            return jsonify({"error": "fields x, y, z required"}), 400
        title = data.get('title', '3D Line Plot')

        fig = plt.figure(figsize=(7,5))
        ax = fig.add_subplot(111, projection='3d')
        ax.plot(x, y, z, linewidth=2)
        ax.set_title(title); ax.set_xlabel('X'); ax.set_ylabel('Y'); ax.set_zlabel('Z')
        ax.view_init(elev=25, azim=-60)
        buf = _png_bytes_from_figure(fig)
        return send_file(buf, mimetype='image/png', download_name='plot3d.png')
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "3d plot generation failed", "msg": str(e)}), 500

@app.route('/animate', methods=['POST'])
def animate():
    try:
        data = request.get_json(force=True) or {}
        anim_type = data.get('type', 'sine')
        frames = int(data.get('frames', 40))
        points = int(data.get('points', 200))
        xr = data.get('xrange', [0, 2 * np.pi])
        amp = float(data.get('amplitude', 1.0))
        freq = float(data.get('freq', 1.0))

        x = np.linspace(float(xr[0]), float(xr[1]), points)
        fig, ax = plt.subplots(figsize=(7,3))
        ax.set_xlim(x.min(), x.max()); ax.set_ylim(-1.5 * amp, 1.5 * amp)
        ax.set_xlabel('x'); ax.set_ylabel('y'); ax.set_title('Animated plot')
        line, = ax.plot([], [], lw=2)

        def init():
            line.set_data([], []); return (line,)

        if anim_type == 'sine':
            def update(frame):
                phase = 2 * np.pi * (frame / frames) * freq
                y = amp * np.sin(x + phase)
                line.set_data(x, y); return (line,)
        else:
            def update(frame):
                shift = (frame / frames) * (x.max() - x.min())
                y = amp * np.exp(-((x - (x.min() + shift))**2) / (0.1 + 0.05 * points))
                line.set_data(x, y); return (line,)

        anim = animation.FuncAnimation(fig, update, init_func=init, frames=frames, blit=True)
        buf = io.BytesIO()
        try:
            writer = animation.PillowWriter(fps=12)
            anim.save(buf, writer=writer)
        except Exception:
            frames_images = []
            for f in range(frames):
                update(f)
                frame_buf = io.BytesIO()
                fig.savefig(frame_buf, format='png', bbox_inches='tight')
                frame_buf.seek(0)
                frames_images.append(Image.open(frame_buf).convert('RGBA'))
                frame_buf.close()
            gif_buf = io.BytesIO()
            frames_images[0].save(gif_buf, format='GIF', save_all=True, append_images=frames_images[1:], loop=0, duration=80)
            buf = gif_buf

        plt.close(fig)
        buf.seek(0)
        return send_file(buf, mimetype='image/gif', download_name='animation.gif')
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "animation generation failed", "msg": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    log.info(f"Starting server on 0.0.0.0:{port}")
    app.run(debug=True, host='0.0.0.0', port=port)
