import React, { useState, useRef, useEffect } from "react";

// The API endpoint remains the same, using Vite environment variables
const DEFAULT_API =
  import.meta?.env?.VITE_API_URL || "https://ipo-analytics-api.onrender.com/operations";

export default function ReconcileApp() {
  const API_URL = DEFAULT_API;

  // --- NEW STATE: Tracks if the warm-up call has succeeded ---
  const [isBackendReady, setIsBackendReady] = useState(false);
  
  // --- Existing State ---
  const [exchangeFile, setExchangeFile] = useState(null);
  const [pspFile, setPspFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [visibleStatus, setVisibleStatus] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const statusAppsCacheRef = useRef({});

  // --- WARM-UP EFFECT (Sets isBackendReady to true on success) ---
  useEffect(() => {
    // The health check URL is the base API URL
    const healthCheckURL = API_URL.replace('/operations', '/');
    
    const warmUpBackend = async () => {
      console.log('Attempting to warm up the backend...');
      try {
        const response = await fetch(healthCheckURL, { method: 'GET', mode: 'cors' });
        
        // If the server responds successfully (even if it took a while)
        if (response.ok) {
            setIsBackendReady(true); // <--- SERVER IS READY
            console.log('Backend warm-up complete. Server is now awake and ready.');
        } else {
            // Handle HTTP error codes from the server if it's awake but misconfigured
            console.error(`Backend warm-up failed with status: ${response.status}`);
            // We set it ready anyway, relying on the upload call to show an error later
            // This prevents indefinite loader if the server is technically running.
            setIsBackendReady(true);
        }
      } catch (error) {
        // This is the expected catch for a sleeping server or network failure
        console.error('Backend warm-up failed (Could be server asleep or network issue):', error);
        // We set it ready after a failure so the user can still try the upload
        // in case the GET failed but POST works, or the server is just slow.
        setIsBackendReady(true); 
      }
    };

    warmUpBackend();
  }, [API_URL]);

  // --- Utility Functions (rest remain the same) ---

  function onDropFile(e, setter) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) setter(f);
  }

  function onChangeFile(e, setter) {
    const f = e.target.files && e.target.files[0];
    if (f) setter(f);
  }

  function clearAll() {
    setExchangeFile(null);
    setPspFile(null);
    setResult(null);
    setError(null);
    setProgress(0);
    statusAppsCacheRef.current = {};
  }

  function upload() {
    setError(null);
    setResult(null);
    if (!exchangeFile || !pspFile) {
      setError("Please select both Exchange and PSP files.");
      return;
    }

    const fd = new FormData();
    fd.append("exchange_file", exchangeFile);
    fd.append("psp_file", pspFile);

    setLoading(true);
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_URL, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        setProgress(Math.max(1, Math.round((e.loaded / e.total) * 100)));
    };

    xhr.onload = () => {
      setLoading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          setResult(json);
          if (json.status_applications)
            statusAppsCacheRef.current = json.status_applications;
        } catch (err) {
          setError("Server returned invalid JSON or response.");
        }
      } else {
        setError(
          `Upload failed (${xhr.status}): ${xhr.responseText || xhr.statusText}`
        );
      }
    };

    xhr.onerror = () => {
      setLoading(false);
      setError("Network error while uploading files. Check CORS or API endpoint.");
    };

    xhr.send(fd);
  }

  const statusesSorted = (() => {
    if (!result?.status_counts) return [];
    const entries = Object.entries(result.status_counts || {});
    entries.sort((a, b) => b[1] - a[1]);
    return entries;
  })();

  function openStatus(status) {
    setVisibleStatus(status);
    setPage(1);
  }

  function closeStatus() {
    setVisibleStatus(null);
  }

  function getApps(status) {
    if (statusAppsCacheRef.current && statusAppsCacheRef.current[status]) {
      return statusAppsCacheRef.current[status];
    }
    return [];
  }

  function downloadStatusCSV(status) {
    const apps = getApps(status) || [];
    const header = "applicationNumber\n";
    const body = apps.join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${status}_applications.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Modal pagination helpers
  const visibleApps = visibleStatus ? getApps(visibleStatus) : [];
  const totalPages = Math.max(
    1,
    Math.ceil((visibleApps?.length || 0) / PAGE_SIZE)
  );
  const visiblePageItems = visibleApps.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  // --- Rendered JSX (Bootstrap) ---
  return (
    <div className="bg-light min-vh-100 p-4 p-sm-5">
      <div className="container-xl mx-auto position-relative">
        
        {/* === Loader Overlay === */}
        {!isBackendReady && (
          <div className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column justify-content-center align-items-center bg-white bg-opacity-75" style={{ zIndex: 1050 }}>
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mt-3 text-secondary">Waking up backend service... please wait.</p>
            <p className="small text-muted">(This may take up to a minute on a free server)</p>
          </div>
        )}
        {/* === END Loader Overlay === */}

        <header className="d-flex justify-content-between align-items-center mb-4">
          <div>
            <div className="d-flex align-items-center mb-1">
              <span className="h4 me-2 text-info" style={{ lineHeight: 1 }}>
                📊
              </span>
              <h1 className="h3 fw-semibold mb-0">IPO Analytics</h1>
            </div>
            <p className="text-muted small">
              Upload Exchange & PSP CSVs — get fast reconciliation summaries.
            </p>
          </div>
          
        </header>

        {/* Upload area */}
        <div className="row g-3 mb-4">
          <div className="col-12 col-sm-8">
            <div className="row g-3">
              <div className="col-12 col-sm-6">
                <FileDrop
                  label="Exchange CSV"
                  file={exchangeFile}
                  onDrop={(e) => onDropFile(e, setExchangeFile)}
                  onChange={(e) => onChangeFile(e, setExchangeFile)}
                  // Disable input/drop if backend is not ready
                  disabled={!isBackendReady}
                />
              </div>

              <div className="col-12 col-sm-6">
                <FileDrop
                  label="PSP CSV"
                  file={pspFile}
                  onDrop={(e) => onDropFile(e, setPspFile)}
                  onChange={(e) => onChangeFile(e, setPspFile)}
                  // Disable input/drop if backend is not ready
                  disabled={!isBackendReady}
                />
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-4">
            <div className="card shadow-sm p-3">
              <h6 className="card-title text-secondary mb-2">Actions</h6>
              <div className="d-flex gap-2 mb-3">
                <button
                  onClick={upload}
                  disabled={loading || !isBackendReady} // Disable if loading OR not ready
                  className="btn btn-primary flex-grow-1"
                >
                  {loading ? `Uploading (${progress}%)` : `Run Reconciliation`}
                </button>

                <button
                  onClick={clearAll}
                  className="btn btn-outline-secondary"
                  disabled={!isBackendReady} // Disable if not ready
                >
                  Clear
                </button>
              </div>

              <p className="text-muted small mb-3">
                Tips: Use CSV files exported from Exchange / PSP.
              </p>

              <div>
                <div className="text-secondary small mb-1">Progress</div>
                <div className="progress mb-1" style={{ height: "8px" }}>
                  <div
                    className="progress-bar bg-info"
                    role="progressbar"
                    style={{ width: `${progress}%`, transition: "width .2s" }}
                    aria-valuenow={progress}
                    aria-valuemin="0"
                    aria-valuemax="100"
                  />
                </div>
                <div className="text-muted small text-end">{progress}%</div>
              </div>

              {error && <div className="text-danger small mt-2">{error}</div>}
            </div>
          </div>
        </div>

        {/* Result summary (rest of JSX unchanged) */}
        {result && (
          <section className="mb-4">
            <div className="row g-3 mb-4">
              <StatCard
                title="Unique in Exchange"
                value={result.exchange_unique_count}
              />
              <StatCard title="Unique in PSP" value={result.psp_unique_count} />
              <StatCard
                title="Exchange only"
                value={result.exchange_only_count}
              />
            </div>

            <div className="card shadow-sm p-4 mb-3">
              <h2 className="h5 card-title mb-3">Status Summary</h2>

              <div className="d-grid gap-3">
                {statusesSorted.length === 0 && (
                  <div className="text-muted small">No statuses found.</div>
                )}

                {statusesSorted.map(([status, count]) => {
                  const maxCount = Math.max(
                    ...statusesSorted.map((s) => s[1]),
                    1
                  );
                  const pct = Math.round((count / maxCount) * 100);
                  
                  const isMismatch = status === "EXCHANGE_GREATER_SEQ_MISMATCH";
                  const btnClass = isMismatch ? "btn-warning text-dark" : "btn-info text-white";

                  return (
                    <div
                      key={status}
                      className={`d-flex align-items-center justify-content-between p-3 border rounded ${isMismatch ? 'bg-warning-subtle' : ''}`}
                    >
                      <div className="flex-grow-1 me-3">
                        <div className="d-flex justify-content-between align-items-center">
                          <div className="fw-medium">{status}</div>
                          <div className="text-muted small">{count}</div>
                        </div>

                        <div
                          className="progress mt-2"
                          style={{ height: "8px" }}
                        >
                          <div
                            className={`progress-bar ${isMismatch ? 'bg-warning' : 'bg-success'}`}
                            role="progressbar"
                            style={{ width: `${pct}%` }}
                            aria-valuenow={pct}
                            aria-valuemin="0"
                            aria-valuemax="100"
                          />
                        </div>
                      </div>

                      <div className="d-flex flex-column flex-sm-row gap-2">
                        <button
                          onClick={() => openStatus(status)}
                          className="btn btn-sm btn-outline-secondary"
                          disabled={count === 0}
                        >
                          Show apps
                        </button>
                        <button
                          onClick={() => downloadStatusCSV(status)}
                          className={`btn btn-sm ${btnClass}`}
                          disabled={count === 0}
                        >
                          Download CSV
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="mt-4 small text-muted">
              Note: Applications where ExchangeSeqNo &gt; PSPSeqNo are listed under the "EXCHANGE_GREATER_SEQ_MISMATCH" status above.
            </div>
          </section>
        )}

        {/* Modal for status applications (unchanged) */}
        {visibleStatus && (
          <div
            className="modal fade show d-block"
            tabIndex="-1"
            role="dialog"
            style={{ backgroundColor: "rgba(0,0,0,0.4)", padding: "1rem" }}
            onClick={closeStatus}
          >
            <div
              className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"
              role="document"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    Applications — {visibleStatus}
                  </h5>
                  <div className="d-flex align-items-center gap-2">
                    <div className="text-muted small me-2">
                      Total: {getApps(visibleStatus)?.length || 0}
                    </div>
                    <button
                      onClick={() => downloadStatusCSV(visibleStatus)}
                      className="btn btn-sm btn-info text-white"
                    >
                      Download CSV
                    </button>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={closeStatus}
                      aria-label="Close"
                    ></button>
                  </div>
                </div>
                <div className="modal-body">
                  <div className="d-grid gap-2">
                    {visiblePageItems.length === 0 && (
                      <div className="text-muted small">
                        No application numbers available for this status.
                      </div>
                    )}
                    {visiblePageItems.map((app, idx) => (
                      <div
                        key={`${visibleStatus}-${idx}`}
                        className="p-2 border rounded bg-light small"
                      >
                        {app}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="modal-footer d-flex justify-content-between">
                  <div className="text-muted small">
                    Page {page} of {totalPages}
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="btn btn-sm btn-outline-secondary"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                      className="btn btn-sm btn-outline-secondary"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Helper Functions and Components (unchanged) ---

function humanReadable(bytes) {
  if (!bytes && bytes !== 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let num = bytes;
  while (num >= 1024 && i < units.length - 1) {
    num /= 1024;
    i++;
  }
  return `${num.toFixed(1)} ${units[i]}`;
}

function FileDrop({ label, file, onDrop, onChange, disabled }) {
  // Add 'disabled' class and logic to the label
  const labelClass = `card card-body text-center border-dashed-2 border-secondary p-4 cursor-pointer ${disabled ? 'bg-light text-muted opacity-75' : 'hover:border-primary'}`;
  
  return (
    <label
      className={labelClass}
      style={{ borderStyle: "dashed", cursor: disabled ? "not-allowed" : "pointer" }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={disabled ? (e) => e.preventDefault() : onDrop} // Disable drop event
    >
      <div className="text-secondary">{label}</div>
      <div className="mt-2">
        <div className="text-muted small">Drag & drop or click to choose</div>
        <div className="mt-1 text-dark small">
          {file
            ? `${file.name} • ${humanReadable(file.size)}`
            : "No file selected"}{" "}
        </div>
      </div>
      <input
        type="file"
        accept=".csv,.txt"
        className="d-none" // hidden input
        onChange={onChange}
        disabled={disabled} // Disable file input itself
      />
    </label>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="col-12 col-sm-4">
      <div className="card shadow-sm p-3">
        <div className="text-muted small">{title}</div>
        <div className="h4 fw-bold mt-1 mb-0">{value ?? "-"}</div>
      </div>
    </div>
  );
}
