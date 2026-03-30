import tkinter as tk
from tkinter import ttk
import subprocess
import time
import os
import random

class ProcessVisualizer:
    def __init__(self, root):
        self.root = root
        self.root.title("HMS Process Creation & State Visualization Tool")
        self.root.geometry("1150x900")
        self.root.configure(bg="#f0f0f0")

        # Colors
        self.PRIMARY_COLOR = "#2c3e50"
        self.STATE_COLORS = {
            "NEW": "#3498db",
            "READY": "#e67e22",
            "RUNNING": "#2ecc71",
            "WAITING": "#f1c40f",
            "TERMINATED": "#95a5a6"
        }
        self.PATIENT_COLORS = ["#3498db", "#e74c3c", "#2ecc71", "#9b59b6", "#f1c40f", "#e67e22"]

        self._setup_header()
        
        self.main_h_paned = ttk.PanedWindow(self.root, orient=tk.HORIZONTAL)
        self.main_h_paned.pack(fill=tk.BOTH, expand=True)

        self._setup_left_sidebar()
        self._setup_right_content()
        self._setup_footer()

        # Tracking patient states for bubbles
        self.patient_vars = []
        self.patient_states = {} # map patient_idx -> current_state_name
        self._generate_patient_form(3)

    def _setup_header(self):
        header_frame = tk.Frame(self.root, bg=self.PRIMARY_COLOR, height=60)
        header_frame.pack(side=tk.TOP, fill=tk.X)
        header_frame.pack_propagate(False)
        tk.Label(header_frame, text="🛡️ HMS Process Creation & State Visualization Tool", 
                 font=("Arial", 18, "bold"), bg=self.PRIMARY_COLOR, fg="white").pack(pady=12)

    def _setup_left_sidebar(self):
        self.sidebar = tk.Frame(self.main_h_paned, bg="#f5f5f5", width=350, padx=10, pady=10)
        self.main_h_paned.add(self.sidebar, weight=0)

        op_labelframe = ttk.LabelFrame(self.sidebar, text="Operation Selection")
        op_labelframe.pack(fill=tk.X, pady=5)
        self.operation = tk.StringVar(value="Patient")
        ttk.Radiobutton(op_labelframe, text="Patient Registration", variable=self.operation, value="Patient").pack(anchor=tk.W, padx=10, pady=2)
        ttk.Radiobutton(op_labelframe, text="Doctor Consultation", variable=self.operation, value="Doctor").pack(anchor=tk.W, padx=10, pady=2)

        self.config_frame = ttk.LabelFrame(self.sidebar, text="Patient Configuration")
        self.config_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        
        n_frame = ttk.Frame(self.config_frame)
        n_frame.pack(fill=tk.X, padx=5, pady=5)
        ttk.Label(n_frame, text="Number of Patients (N):").pack(side=tk.LEFT)
        self.n_entry = ttk.Entry(n_frame, width=5)
        self.n_entry.insert(0, "3")
        self.n_entry.pack(side=tk.LEFT, padx=5)
        ttk.Button(n_frame, text="Generate", command=self._on_generate_click, width=7).pack(side=tk.LEFT)

        self.canvas_scroll = tk.Canvas(self.config_frame, highlightthickness=0)
        self.scrollbar = ttk.Scrollbar(self.config_frame, orient="vertical", command=self.canvas_scroll.yview)
        self.scrollable_frame = ttk.Frame(self.canvas_scroll)
        self.scroll_window_id = self.canvas_scroll.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas_scroll.configure(yscrollcommand=self.scrollbar.set)
        self.scrollable_frame.bind("<Configure>", lambda e: self.canvas_scroll.configure(scrollregion=self.canvas_scroll.bbox("all")))
        self.canvas_scroll.bind("<Configure>", lambda e: self.canvas_scroll.itemconfig(self.scroll_window_id, width=e.width))
        self.canvas_scroll.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        action_frame = ttk.Frame(self.sidebar)
        action_frame.pack(fill=tk.X, pady=10)
        ttk.Button(action_frame, text="▶ Start Simulation", command=self.start_simulation).pack(fill=tk.X, pady=2)
        ttk.Button(action_frame, text="🔄 Reset", command=self.reset_all).pack(fill=tk.X, pady=2)
        
        sub_btn_frame = ttk.Frame(action_frame)
        sub_btn_frame.pack(fill=tk.X)
        ttk.Button(sub_btn_frame, text="Fill Sample Data", command=self.fill_sample).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=2)
        ttk.Button(sub_btn_frame, text="Clear All", command=self.clear_all).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=2)

        self.live_status_frame = ttk.LabelFrame(self.sidebar, text="Live Patient Status")
        self.live_status_frame.pack(fill=tk.X, pady=5)
        self.status_log = tk.Text(self.live_status_frame, height=8, width=40, font=("Arial", 9))
        self.status_log.pack(padx=5, pady=5)

    def _setup_right_content(self):
        self.right_paned = ttk.PanedWindow(self.main_h_paned, orient=tk.VERTICAL)
        self.main_h_paned.add(self.right_paned, weight=1)

        # 1. State Visualization (No internal scrollbar)
        state_vis_seg = ttk.Frame(self.right_paned)
        self.right_paned.add(state_vis_seg, weight=0)
        tk.Label(state_vis_seg, text="Current Process Detail", font=("Arial", 10, "bold")).pack(anchor=tk.W, padx=10, pady=(5,0))
        self.current_process_lbl = tk.Label(state_vis_seg, text="Idle", font=("Arial", 11), fg="#27ae60")
        self.current_process_lbl.pack(anchor=tk.W, padx=10)

        state_labelframe = ttk.LabelFrame(state_vis_seg, text="Process State Visualization")
        state_labelframe.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        self.flow_canvas = tk.Canvas(state_labelframe, height=180, bg="white", highlightthickness=0)
        self.flow_canvas.pack(fill=tk.BOTH, expand=True)

        # Helper for adding text boxes with scrollbars
        def add_scrollable_pane(title):
            frame = ttk.LabelFrame(self.right_paned, text=title)
            self.right_paned.add(frame, weight=1)
            txt = tk.Text(frame, bg="white", highlightthickness=0, font=("Courier", 10))
            scrolly = ttk.Scrollbar(frame, orient="vertical", command=txt.yview)
            txt.configure(yscrollcommand=scrolly.set)
            txt.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
            scrolly.pack(side=tk.RIGHT, fill=tk.Y)
            return txt

        # 2. Hierarchy
        self.hierarchy_text = add_scrollable_pane("Process Hierarchy")
        # 3. Timeline (Canvas needs different scroll handle)
        timeline_frame = ttk.LabelFrame(self.right_paned, text="Execution Timeline")
        self.right_paned.add(timeline_frame, weight=1)
        self.timeline_canvas = tk.Canvas(timeline_frame, bg="white", highlightthickness=0)
        timeline_scrolly = ttk.Scrollbar(timeline_frame, orient="vertical", command=self.timeline_canvas.yview)
        self.timeline_canvas.configure(yscrollcommand=timeline_scrolly.set)
        self.timeline_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        timeline_scrolly.pack(side=tk.RIGHT, fill=tk.Y)
        # 4. Log
        self.execution_log = add_scrollable_pane("Execution Log")

    def _setup_footer(self):
        footer = tk.Frame(self.root, bg="#f5f5f5", height=30, relief="ridge", borderwidth=1)
        footer.pack(side=tk.BOTTOM, fill=tk.X)
        self.patient_indicators = tk.Frame(footer, bg="#f5f5f5")
        self.patient_indicators.pack(side=tk.RIGHT, padx=10)

    def _draw_state_flow(self):
        self.flow_canvas.delete("all")
        states = ["NEW", "READY", "RUNNING", "WAITING", "TERMINATED"]
        x_start, y, width, gap = 60, 60, 100, 80
        
        self.state_coords = {} # state_name -> x_center
        for i, state in enumerate(states):
            x = x_start + i * (width + gap)
            self.flow_canvas.create_rectangle(x, y-25, x+width, y+25, fill=self.STATE_COLORS[state], outline="#333")
            self.flow_canvas.create_text(x + width/2, y, text=state, fill="white", font=("Arial", 10, "bold"))
            self.state_coords[state] = x + width/2
            if i < len(states) - 1:
                self.flow_canvas.create_line(x+width, y, x+width+gap, y, arrow=tk.LAST, fill="#7f8c8d", width=2)

        # Draw patient bubbles (stacking in multi-rows if many patients)
        bubble_y_start = y + 45
        state_counts = {s: 0 for s in states}
        for p_idx, s_name in self.patient_states.items():
            if s_name in states:
                x_center = self.state_coords[s_name]
                count = state_counts[s_name]
                col = count % 4
                row = count // 4
                offset_x = (col * 22) - 33
                offset_y = row * 22
                
                bx, by = x_center + offset_x, bubble_y_start + offset_y
                color = self.PATIENT_COLORS[p_idx % len(self.PATIENT_COLORS)]
                self.flow_canvas.create_oval(bx-10, by-10, bx+10, by+10, fill=color, outline="white")
                self.flow_canvas.create_text(bx, by, text=f"P{p_idx+1}", fill="white", font=("Arial", 7, "bold"))
                state_counts[s_name] += 1

    def _generate_patient_form(self, n):
        for w in self.scrollable_frame.winfo_children(): w.destroy()
        self.patient_vars = []
        self.patient_states = {}
        for i in range(n):
            p_id = i + 1
            color = self.PATIENT_COLORS[i % len(self.PATIENT_COLORS)]
            f = tk.Frame(self.scrollable_frame, bg="white", borderwidth=1, relief="solid", pady=5)
            f.pack(fill=tk.X, pady=5, padx=5)
            h = tk.Frame(f, bg=color); h.pack(fill=tk.X)
            tk.Label(h, text=f"Patient P{p_id}", fg="white", bg=color, font=("Arial", 9, "bold")).pack(side=tk.LEFT, padx=5)
            ins = tk.Frame(f, bg="white", padx=5); ins.pack(fill=tk.X)
            v = {}
            for r, l in enumerate(["Name", "Age", "Ailment"]):
                tk.Label(ins, text=l+":", bg="white", font=("Arial", 8)).grid(row=r, column=0, sticky="w")
                v[l] = ttk.Entry(ins, width=25); v[l].grid(row=r, column=1, sticky="w", padx=5, pady=1)
            self.patient_vars.append(v)
        self.root.update_idletasks()
        self.canvas_scroll.configure(scrollregion=self.canvas_scroll.bbox("all"))
        self._draw_state_flow()

    def _on_generate_click(self):
        try:
            val = self.n_entry.get().strip()
            if not val: return
            n = int(val)
            if 1 <= n: # Remove limit of 10
                self._generate_patient_form(n)
                self.log_status(f"Generated registration form for {n} patients.")
        except: pass

    def fill_sample(self):
        names = ["Alice", "Bob", "Charlie", "David", "Emma", "Frank", "Grace", "Henry", "Jack", "Kevin"]
        for i, v in enumerate(self.patient_vars):
            v["Name"].insert(0, names[i % len(names)]); v["Age"].insert(0, str(20+(i%50))); v["Ailment"].insert(0, "Checkup")

    def clear_all(self):
        for v in self.patient_vars: 
            for k in v: v[k].delete(0, tk.END)

    def reset_all(self):
        self.status_log.delete("1.0", tk.END)
        self.hierarchy_text.delete("1.0", tk.END)
        self.timeline_canvas.delete("all")
        self.execution_log.delete("1.0", tk.END)
        self.patient_states = {}
        self._draw_state_flow()

    def log_status(self, m): self.status_log.insert(tk.END, f"> {m}\n"); self.status_log.see(tk.END); self.root.update()
    def log_exec(self, m): self.execution_log.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {m}\n"); self.execution_log.see(tk.END); self.root.update()

    def update_patient_loc(self, p_idx, state_name):
        self.patient_states[p_idx] = state_name
        self._draw_state_flow()
        # Highlight box red during active transition
        idx = ["NEW", "READY", "RUNNING", "WAITING", "TERMINATED"].index(state_name)
        x = 60 + idx * 180
        self.flow_canvas.create_rectangle(x-2, 60-27, x+100+2, 60+27, outline="#e74c3c", width=3)
        self.root.update()

    def start_simulation(self):
        self.reset_all()
        n = len(self.patient_vars)
        if n == 0: return
        self.log_exec("==== Simulation Started ====")
        parent_pid = os.getpid()
        self.hierarchy_text.insert(tk.END, f"Parent(Hospital) PID: {parent_pid}\n")
        
        timeline_x = [10] * n
        for i in range(n):
            name = self.patient_vars[i]["Name"].get().strip() or f"P{i+1}"
            self.current_process_lbl.config(text=f"{name} - processing...")
            
            for state in ["NEW", "READY", "RUNNING", "WAITING", "TERMINATED"]:
                self.log_exec(f"{name} entering {state}")
                self.update_patient_loc(i, state)
                if state == "NEW":
                    try: c = subprocess.Popen(["timeout", "1"], shell=True)
                    except: c = subprocess.Popen(["sleep", "1"], shell=True)
                    self.hierarchy_text.insert(tk.END, f"  └── fork() -> {name} (PID: {c.pid})\n")
                
                self._draw_tl_bar(i, state, timeline_x[i])
                timeline_x[i] += 80
                if state == "WAITING": c.wait()
                time.sleep(0.5)
        self.current_process_lbl.config(text="Simulation Finished")
        self.log_exec("==== Simulation Finished ====")

    def _draw_tl_bar(self, p_idx, s, x):
        y = 10 + p_idx * 40
        # Add a row label if it's the first box in the row
        if x == 10:
            self.timeline_canvas.create_text(x + 5, y - 5, text=f"Patient P{p_idx+1}", anchor="w", font=("Arial", 8, "bold"), fill=self.PRIMARY_COLOR)
            
        self.timeline_canvas.create_rectangle(x, y, x+85, y+30, fill=self.STATE_COLORS[s], outline="#333")
        self.timeline_canvas.create_text(x+42, y+15, text=f"P{p_idx+1}: {s}", fill="white", font=("Arial", 7, "bold"))
        self.timeline_canvas.configure(scrollregion=self.timeline_canvas.bbox("all"))
        self.root.update()

if __name__ == "__main__":
    tk.Tk().call('tk', 'scaling', 1.0)
    root = tk.Tk()
    app = ProcessVisualizer(root)
    root.mainloop()

