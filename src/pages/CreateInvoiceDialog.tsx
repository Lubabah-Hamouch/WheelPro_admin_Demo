import { useState } from "react";
import { useI18n } from "../i18n";
import { clientLabel } from "../model";
import { useStore } from "../store";
import { Modal } from "../ui";

/**
 * "Create Invoice": a client — active ones only, an inactive client takes no new invoice — and the
 * invoice date. Checked on Submit; the new draft opens with "Record successfully created".
 */
export function CreateInvoiceDialog({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const { state, actions, navigate, setFlash } = useStore();
  const { t } = useI18n();
  const active = [...state.clients].filter((c) => c.active).sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), "fr"));
  const [client, setClient] = useState(clientId && active.some((c) => c.id === clientId) ? clientId : "");
  const [date, setDate] = useState(state.today);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title={t("create_invoice")}
      onClose={onClose}
      onSubmit={() => {
        if (!client) return setError(t("field_required", { field: t("client") }));
        if (!state.clients.find((c) => c.id === client)?.active) return setError(t("client_inactive_no_invoice"));
        const id = actions.createInvoice(client, date);
        setFlash({ tone: "success", text: t("record_created") });
        onClose();
        navigate(`invoices/${id}`, true);
      }}
    >
      <div className={`form-group${error ? " has-error" : ""}`}>
        <label htmlFor="create_invoice_client_id">{t("client")}</label>
        <select id="create_invoice_client_id" className="form-control" value={client} autoFocus onChange={(e) => (setClient(e.target.value), setError(null))}>
          <option value="" />
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {clientLabel(c)}
            </option>
          ))}
        </select>
        {error && <p className="help-block">{error}</p>}
      </div>
      <div className="form-group">
        <label htmlFor="invoice_date_created">{t("invoice_date")}</label>
        <input id="invoice_date_created" type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
    </Modal>
  );
}
