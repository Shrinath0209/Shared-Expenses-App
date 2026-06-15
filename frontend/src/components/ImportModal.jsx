import React, { useState, useRef } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { Upload } from 'lucide-react';

export default function ImportModal({ groupId, onClose, onSave }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef();

  const handleFile = async (f) => {
    if (!f || !f.name.endsWith('.csv')) { toast.error('Please select a CSV file'); return; }
    setFile(f);
    setPreview(null);
    setResult(null);

    // Preview
    const formData = new FormData();
    formData.append('file', f);
    try {
      const { data } = await api.post('/import/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Preview failed');
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('group_id', groupId);
    try {
      const { data } = await api.post('/import/execute', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(data);
      toast.success(`Imported ${data.imported} expenses!`);
      onSave();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const getSeverityClass = (severity) => {
    if (severity === 'error') return 'error';
    if (severity === 'warning') return 'warning';
    return 'info';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal" onClick={e => e.stopPropagation()}>
        <h2>📂 Import expenses_export.csv</h2>

        {!result && (
          <>
            <div
              id="drop-zone"
              className={`upload-zone ${isDragOver ? 'drag-over' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={e => { e.preventDefault(); setIsDragOver(false); handleFile(e.dataTransfer.files[0]); }}
            >
              <div className="upload-icon">📊</div>
              <strong>{file ? file.name : 'Click or drag to upload CSV'}</strong>
              <p>{file ? `${(file.size / 1024).toFixed(1)} KB ready` : 'Supports expenses_export.csv format'}</p>
              <input id="csv-file-input" ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])} />
            </div>

            {preview && (
              <>
                <div className="import-summary">
                  <div className="import-stat success"><div className="value">{preview.willImport}</div><div className="label">Will Import</div></div>
                  <div className="import-stat danger"><div className="value">{preview.willSkip}</div><div className="label">Will Skip</div></div>
                  <div className="import-stat warn"><div className="value">{preview.anomalyCount}</div><div className="label">Anomalies</div></div>
                </div>

                {preview.anomalies?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 14, marginBottom: 10, color: 'var(--text-secondary)' }}>
                      Anomaly Report ({preview.anomalies.flatMap(a => a.anomalies).length} issues found)
                    </h4>
                    <div className="anomaly-list">
                      {preview.anomalies.flatMap(a => a.anomalies).map((anom, i) => (
                        <div key={i} className={`anomaly-item ${getSeverityClass(anom.severity)}`}>
                          <span className="anomaly-code">[{anom.code}]</span>
                          <strong>{anom.type}</strong>
                          <br />
                          <span style={{ fontSize: 12 }}>{anom.detail}</span>
                          <span style={{ float: 'right', fontSize: 11, color: 'var(--text-muted)' }}>→ {anom.action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {preview.skipped?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 14, marginBottom: 10, color: 'var(--text-secondary)' }}>Skipped Rows</h4>
                    <div className="anomaly-list">
                      {preview.skipped.map((s, i) => (
                        <div key={i} className="anomaly-item error">
                          <strong>Row {s.rowNum}:</strong> {s.description}<br/>
                          <span style={{ fontSize: 12 }}>{s.reasons}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {result && (
          <div>
            <div className="import-summary">
              <div className="import-stat success"><div className="value">{result.imported}</div><div className="label">Imported</div></div>
              <div className="import-stat danger"><div className="value">{result.skipped}</div><div className="label">Skipped</div></div>
              <div className="import-stat warn"><div className="value">{result.anomalyCount}</div><div className="label">Anomalies</div></div>
            </div>
            <p style={{ color: 'var(--green)', textAlign: 'center', marginTop: 8 }}>✅ Import complete! Report ID: #{result.reportId}</p>
          </div>
        )}

        <div className="modal-actions">
          <button id="close-import-btn" className="btn-ghost" onClick={onClose}>
            {result ? 'Done' : 'Cancel'}
          </button>
          {preview && !result && (
            <button id="confirm-import-btn" className="btn-primary" onClick={handleImport} disabled={importing}>
              <Upload size={16} />
              {importing ? 'Importing...' : `Import ${preview.willImport} Expenses`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
