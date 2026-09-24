import React, { useEffect } from "react";

export interface PopupCardProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: "success" | "error" | "info" | "warning";
  actionText?: string;
  details?: string[];
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isLoading?: boolean;
}

/**
 * Beautiful Pop-Up Card replacing dirty native browser alert() dialogs
 */
export const PopupCard: React.FC<PopupCardProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = "success",
  actionText = "Got it",
  details,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const config = {
    success: {
      bg: "#F0FDF4",
      border: "#86EFAC",
      badgeBg: "#DCFCE7",
      badgeColor: "#16A34A",
      icon: "✓",
      btnGradient: "linear-gradient(135deg, #10B981, #059669)",
      ringColor: "rgba(16, 185, 129, 0.2)",
    },
    error: {
      bg: "#FEF2F2",
      border: "#FECACA",
      badgeBg: "#FEE2E2",
      badgeColor: "#DC2626",
      icon: "✕",
      btnGradient: "linear-gradient(135deg, #EF4444, #DC2626)",
      ringColor: "rgba(239, 68, 68, 0.2)",
    },
    warning: {
      bg: "#FFFBEB",
      border: "#FDE68A",
      badgeBg: "#FEF3C7",
      badgeColor: "#D97706",
      icon: "!",
      btnGradient: "linear-gradient(135deg, #F59E0B, #D97706)",
      ringColor: "rgba(245, 158, 11, 0.2)",
    },
    info: {
      bg: "#F0FDFA",
      border: "#99F6E4",
      badgeBg: "#CCFBF1",
      badgeColor: "#0D9488",
      icon: "ℹ",
      btnGradient: "linear-gradient(135deg, #0D9488, #0F766E)",
      ringColor: "rgba(13, 148, 136, 0.2)",
    },
  }[type];

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF",
          borderRadius: 20,
          maxWidth: 440,
          width: "100%",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: config.bg,
            borderBottom: `1px solid ${config.border}`,
            padding: "24px 24px 18px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: config.badgeBg,
              color: config.badgeColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 800,
              flexShrink: 0,
              boxShadow: `0 0 0 6px ${config.ringColor}`,
            }}
          >
            {config.icon}
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 800,
                color: "#0F172A",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                letterSpacing: "-0.02em",
              }}
            >
              {title}
            </h3>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: config.badgeColor,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              WhatsApp Notification
            </span>
          </div>
        </div>

        <div style={{ padding: "24px" }}>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.6,
              color: "#334155",
              fontWeight: 500,
            }}
          >
            {message}
          </p>

          {details && details.length > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                background: "#F8FAFC",
                borderRadius: 12,
                border: "1px solid #E2E8F0",
                fontSize: 12,
                color: "#64748B",
              }}
            >
              {details.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                  <span style={{ color: config.badgeColor, fontWeight: 700 }}>•</span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              style={{
                background: config.btnGradient,
                color: "#FFFFFF",
                border: "none",
                borderRadius: 12,
                padding: "11px 24px",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)",
              }}
            >
              {actionText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Beautiful Confirmation Dialog replacing dirty native window.confirm()
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDanger = false,
  isLoading = false,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isLoading) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isLoading]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!isLoading) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF",
          borderRadius: 20,
          maxWidth: 440,
          width: "100%",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "24px 24px 18px 24px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: isDanger ? "#FEF2F2" : "#F0FDFA",
                color: isDanger ? "#DC2626" : "#0D9488",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                fontWeight: 800,
                flexShrink: 0,
                border: `1px solid ${isDanger ? "#FECACA" : "#99F6E4"}`,
              }}
            >
              {isDanger ? "⚠️" : "❓"}
            </div>
            <div>
              <h3
                style={{
                  margin: "0 0 6px 0",
                  fontSize: 17,
                  fontWeight: 800,
                  color: "#0F172A",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                {title}
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "#64748B",
                }}
              >
                {message}
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#F8FAFC",
            borderTop: "1px solid #E2E8F0",
            padding: "16px 24px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            disabled={isLoading}
            onClick={onClose}
            style={{
              background: "#FFFFFF",
              border: "1px solid #CBD5E1",
              color: "#475569",
              borderRadius: 10,
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {cancelText}
          </button>
          <button
            disabled={isLoading}
            onClick={onConfirm}
            style={{
              background: isDanger
                ? "linear-gradient(135deg, #EF4444, #DC2626)"
                : "linear-gradient(135deg, #0D9488, #0F766E)",
              border: "none",
              color: "#FFFFFF",
              borderRadius: 10,
              padding: "9px 20px",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              cursor: isLoading ? "wait" : "pointer",
              boxShadow: isDanger
                ? "0 4px 12px rgba(220, 38, 38, 0.25)"
                : "0 4px 12px rgba(13, 148, 136, 0.25)",
            }}
          >
            {isLoading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
