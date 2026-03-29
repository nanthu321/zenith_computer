const BASE = "/api/tasks";

async function req(method, path, body) {
  const token = localStorage.getItem("token");
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const tasksApi = {
  listTasks: () => req("GET", ""),

  getTask: (taskId) => req("GET", `/${taskId}`),

  cancelTask: (taskId) => req("POST", `/${taskId}/cancel`),

  downloadOutput: (taskId, filename) => {
    const token = localStorage.getItem("token");
    fetch(`${BASE}/${taskId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename || "output";
        a.click();
        URL.revokeObjectURL(a.href);
      });
  },
};
