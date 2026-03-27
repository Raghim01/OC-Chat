import { useState, useEffect, useCallback } from "react";
import { fetchConfig, applyConfigPatch } from "../api/config";
import type { ConfigPayload } from "../types/config";

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function Settings({ open, onClose, onSuccess, onError }: SettingsProps) {
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [patch, setPatch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadConfig = useCallback(() => {
    setLoading(true);
    fetchConfig()
      .then(setConfig)
      .catch((err: Error) => onError(`Could not load config: ${err.message}`))
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(() => {
    if (open) loadConfig();
  }, [open, loadConfig]);

  const handleSubmit = () => {
    if (!patch.trim()) return;
    setSubmitting(true);
    applyConfigPatch(patch)
      .then((updated) => {
        setConfig(updated);
        setPatch("");
        onSuccess("Config updated successfully");
      })
      .catch((err: Error) => onError(`Could not apply patch: ${err.message}`))
      .finally(() => setSubmitting(false));
  };

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">Gateway Config</span>
          <button className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="settings-body">
          <p className="settings-label">Current config</p>
          {loading ? (
            <div className="settings-loading">
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            </div>
          ) : (
            <pre className="settings-config-view">
              {config ? JSON.stringify(config.config, null, 2) : "—"}
            </pre>
          )}

          <p className="settings-label">Partial patch (JSON5, merge-patch)</p>
          <textarea
            className="settings-patch-input"
            value={patch}
            onChange={(e) => setPatch(e.target.value)}
            placeholder={'{ "channels": { "default": { "model": "..." } } }'}
            spellCheck={false}
          />

          <div className="settings-actions">
            <button
              className="settings-submit"
              onClick={handleSubmit}
              disabled={submitting || !patch.trim()}
            >
              {submitting ? "Applying…" : "Apply patch"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
