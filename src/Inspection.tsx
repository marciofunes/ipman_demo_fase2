import { useRef, useState } from "react";
import {
  Upload,
  Search,
  Check,
  RotateCcw,
  ScanLine,
  Eye,
  X,
  Download,
} from "lucide-react";
import {
  mockData,
  demoRepository,
  validateReference,
  type Inspection,
  type Reference,
  type Outcome,
} from "./data";
import { useI18n } from "./i18n";
import { Modal } from "./Modal";
import { readReference } from "./referenceImport";
import { Badge, Card, Photo, Stat } from "./ui";
export function Evidence({ inspection }: { inspection: Inspection }) {
  const { t } = useI18n();
  const [overlay, setOverlay] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="evidence-grid">
      <Card className="image-card">
        <div className="card-toolbar">
          <h2>{t("Evidência por peça")}</h2>
          <div className="segmented">
            <button
              className={!overlay ? "selected" : ""}
              onClick={() => setOverlay(false)}
            >
              {t("Imagem original")}
            </button>
            <button
              className={overlay ? "selected" : ""}
              onClick={() => setOverlay(true)}
            >
              {t("Regiões detectadas")}
            </button>
          </div>
        </div>
        <Photo>
          {overlay &&
            inspection.fields.map((f) => (
              <button
                key={f.id}
                title={`${f.id}: ${f.expected} → ${f.detected} · ${t(f.status)}`}
                aria-label={`${f.id} ${t(f.status)}`}
                className={`region ${f.status === "Conforme" ? "ok" : f.status === "Divergente" ? "bad" : "warn"} ${selected === f.id ? "focused" : ""}`}
                style={{
                  left: `${f.x}%`,
                  top: `${f.y}%`,
                  width: `${f.w}%`,
                  height: `${f.h}%`,
                }}
                onClick={() => setSelected(f.id)}
              >
                <span>{f.expected}</span>
              </button>
            ))}
        </Photo>
        <p className="image-caption">
          {t(
            "Overlay: verde = conforme | vermelho/laranja = divergência ou qualidade insuficiente",
          )}
        </p>
      </Card>
      <div className="evidence-side">
        <Card
          className={`signal ${inspection.result === "Aprovado" ? "pass" : ""}`}
          title={t("Sinalização local")}
        >
          <Badge text={inspection.result} />
          <p>
            {t("Verde: peça conforme")}
            <br />
            {t("Vermelho: reprovação")}
          </p>
          <small>
            {t(
              "Interface física próxima ao ponto de passagem, independente da dashboard.",
            )}
          </small>
        </Card>
        <Card title={t("Esperado × detectado")}>
          <div className="comparison-head">
            <span>{t("Esperado")}</span>
            <span>{t("Detectado")}</span>
            <span>{t("Resultado")}</span>
          </div>
          <div className="comparison-list">
            {inspection.fields.map((f) => (
              <button
                className={selected === f.id ? "selected" : ""}
                key={f.id}
                onClick={() => {
                  setSelected(f.id);
                  setOverlay(true);
                }}
              >
                <strong>{f.expected}</strong>
                <span>{f.detected}</span>
                <Badge text={f.status} />
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
export function CurrentInspection({
  inspection,
  setInspection,
  activeVersion,
}: {
  inspection: Inspection;
  setInspection: (v: Inspection) => void;
  activeVersion: number;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const index = useRef(0);
  const counts = {
    ok: inspection.fields.filter((f) => f.status === "Conforme").length,
    bad: inspection.fields.filter((f) =>
      ["Divergente", "Qualidade baixa"].includes(f.status),
    ).length,
    missing: inspection.fields.filter((f) => f.status === "Não detectado")
      .length,
  };
  async function inspect() {
    setBusy(true);
    setError(false);
    try {
      index.current++;
      const next = await demoRepository.inspect(index.current);
      setInspection({ ...next, version: activeVersion });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-intro intro-action">
        <div>
          <p>
            {t(
              "Comparação online entre gravação esperada e conteúdo/qualidade observados",
            )}
          </p>
          <span>
            #{inspection.id} · {t("Última inspeção")}: {inspection.time}
          </span>
        </div>
        <button className="primary" disabled={busy} onClick={inspect}>
          <ScanLine size={17} />
          {t(busy ? "Processando inspeção…" : "Executar nova inspeção")}
        </button>
      </div>
      {error && (
        <div role="alert" className="notice">
          {t("Ocorreu um erro ao exibir esta tela.")}
          <button onClick={inspect}>{t("Tentar novamente")}</button>
        </div>
      )}
      <div className="stats six">
        <Stat
          label={t("Resultado")}
          value={<Badge text={inspection.result} />}
        />
        <Stat label="PN" value={inspection.pn} />
        <Stat
          label={t("Conformes")}
          value={`${counts.ok} / ${inspection.fields.length}`}
          tone="good"
        />
        <Stat label={t("Divergentes")} value={counts.bad} tone="danger" />
        <Stat
          label={t("Não detectados")}
          value={counts.missing}
          tone="warning"
        />
        <Stat
          label={t("Referência")}
          value={`v${inspection.version}`}
          tone="purple"
        />
      </div>
      <Evidence inspection={inspection} />
      <p className="notice">
        {t(
          "Qualidade de gravação é uma dimensão própria: um texto pode ser lido pelo OCR e ainda assim ser reprovado por caractere incompleto, gravação fraca ou falha parcial.",
        )}
      </p>
    </>
  );
}
export function ReferenceScreen({
  references,
  setReferences,
  active,
  setActive,
}: {
  references: Reference[];
  setReferences: (r: Reference[]) => void;
  active: number;
  setActive: (v: number) => void;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("265258072");
  const [pn, setPn] = useState("265258072");
  const [message, setMessage] = useState("");
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const ref = references.find((r) => r.version === active)!;
  const config = Object.hasOwn(ref.pns, pn) ? ref.pns[pn] : undefined;
  const date = (s: string) =>
    new Date(s + "T12:00:00").toLocaleDateString(locale);
  async function upload(file?: File) {
    if (!file) return;
    try {
      const v = await readReference(file);
      const version = Math.max(...references.map((r) => r.version)) + 1;
      setReferences([
        {
          version,
          date: "2026-10-21",
          author: "Bosch",
          comment: "Importação local",
          pns: v.pns,
        },
        ...references,
      ]);
      setActive(version);
      setPn(Object.keys(v.pns)[0]);
      setQuery(Object.keys(v.pns)[0]);
      setMessage("Referência validada e ativada nesta sessão.");
      setInvalid(false);
    } catch {
      setInvalid(true);
      setMessage("Arquivo inválido. Use o formato documentado no README.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <div className="page-intro">
        <p>
          {t(
            "Governança do arquivo de configuração utilizado para validar cada PN",
          )}
        </p>
      </div>
      {message && (
        <div
          role={invalid ? "alert" : "status"}
          className={`notice ${invalid ? "danger" : ""}`}
        >
          {t(message)}
        </div>
      )}
      <div className="split">
        <Card title={t("Arquivo ativo")}>
          <div className="active-file">
            <div className="file-icon">JSON</div>
            <div>
              <strong>
                Fields PNs.xlsx <span className="version">v{active}</span>
              </strong>
              <p>
                {t("Ativado em")}: {date(ref.date)} · {t("Origem: Bosch")}
              </p>
              <small>{t(ref.comment)}</small>
            </div>
          </div>
          <input
            hidden
            type="file"
            accept="application/json,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
            ref={input}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          <button className="primary" onClick={() => input.current?.click()}>
            <Upload size={16} />
            {t("Enviar nova versão")}
          </button>
          <p className="tiny muted">
            {t("Selecione um arquivo JSON ou XLSX com PNs e campos.")}
          </p>
        </Card>
        <Card title={t("Validação antes de ativar")}>
          <ul className="checklist">
            {[
              "Estrutura válida",
              "PNs identificáveis",
              "Campos esperados interpretáveis",
              "Versão preservada para rollback",
            ].map((s) => (
              <li key={s}>
                <Check size={17} />
                {t(s)}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title={t("Consulta da referência por PN")}>
        <form
          className="search-form"
          onSubmit={(e) => {
            e.preventDefault();
            setPn(query.trim());
          }}
        >
          <label>
            PN
            <input
              aria-label="PN"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              list="pns"
            />
          </label>
          <datalist id="pns">
            {Object.keys(ref.pns).map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <button className="primary">
            <Search size={16} />
            {t("Consultar")}
          </button>
        </form>
        {config ? (
          <>
            <div className="stats three compact">
              <Stat label={t("Cliente")} value={config.client} />
              <Stat label={t("Família")} value={config.family} />
              <Stat
                label={t("Campos definidos")}
                value={config.fields.length}
              />
            </div>
            <h3>{t("Campos esperados para o PN selecionado")}</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {["Campo", "Valor esperado", "Uso"].map((h) => (
                      <th key={h}>{t(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {config.fields.map((f) => (
                    <tr key={f.id}>
                      <td>{f.id}</td>
                      <td>
                        <code>{f.value}</code>
                      </td>
                      <td>{t(f.use)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p role="status">{t("Nenhum PN encontrado.")}</p>
        )}
      </Card>
      <Card title={t("Histórico de versões")}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {["Versão", "Data", "Autor", "Comentário", "Status"].map(
                  (h) => (
                    <th key={h}>{t(h)}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {references.map((r) => (
                <tr key={r.version}>
                  <td>v{r.version}</td>
                  <td>{date(r.date)}</td>
                  <td>{r.author}</td>
                  <td>{t(r.comment)}</td>
                  <td>
                    {active === r.version ? (
                      <Badge text="Ativa" />
                    ) : (
                      <button
                        className="secondary"
                        onClick={() => {
                          setActive(r.version);
                          setMessage("Referência restaurada nesta sessão.");
                          setInvalid(false);
                        }}
                      >
                        <RotateCcw size={14} />
                        {t("Ativar")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
export function HistoryScreen({
  history,
  onReview,
}: {
  history: Inspection[];
  onReview: (i: Inspection, note: string) => void;
}) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("Todos");
  const [detail, setDetail] = useState<Inspection | null>(null);
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<Outcome>("Revisão");
  const [saved, setSaved] = useState(false);
  const filtered = history.filter(
    (i) =>
      (result === "Todos" || i.result === result) &&
      `${i.id} ${i.pn}`.includes(search),
  );
  function open(i: Inspection) {
    setDetail(i);
    setDecision(i.result);
    setNote(i.review?.note ?? "");
    setSaved(false);
  }
  function close() {
    setDetail(null);
  }
  return (
    <>
      <div className="page-intro">
        <p>
          {t(
            "Rastreabilidade das peças, resultados, evidências e versões de referência utilizadas",
          )}
        </p>
      </div>
      <div className="stats five">
        <Stat
          label={t("Inspeções hoje")}
          value={mockData.inspection.today.toLocaleString(locale)}
        />
        <Stat
          label={t("Aprovadas")}
          value={mockData.inspection.approved.toLocaleString(locale)}
          tone="good"
        />
        <Stat
          label={t("Reprovadas")}
          value={mockData.inspection.rejected}
          tone="danger"
        />
        <Stat
          label={t("Revisão")}
          value={mockData.inspection.review}
          tone="warning"
        />
        <Stat label={t("Retenção")} value={t("90 dias (simulado)")} />
      </div>
      <Card title={t("Inspeções recentes")}>
        <div className="history-filters">
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label={t("Buscar identificador ou PN")}
              placeholder={t("Buscar identificador ou PN")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            {t("Resultado")}
            <select value={result} onChange={(e) => setResult(e.target.value)}>
              {["Todos", "Aprovado", "Reprovado", "Revisão"].map((v) => (
                <option key={v} value={v}>
                  {t(v)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Data",
                  "Hora",
                  "Identificador",
                  "PN",
                  "Resultado",
                  "Motivo",
                  "Referência",
                  "Evidências",
                ].map((h) => (
                  <th key={h}>{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td>
                    {new Date(i.date + "T12:00:00").toLocaleDateString(locale)}
                  </td>
                  <td>{i.time}</td>
                  <td>
                    <button className="text-link" onClick={() => open(i)}>
                      #{i.id}
                    </button>
                  </td>
                  <td>
                    <code>{i.pn}</code>
                  </td>
                  <td>
                    <Badge text={i.result} />
                  </td>
                  <td>{t(i.reason)}</td>
                  <td>
                    <span className="version">v{i.version}</span>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`${t("Abrir evidência")} ${i.id}`}
                      onClick={() => open(i)}
                    >
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="empty">{t("Nenhuma inspeção encontrada.")}</p>
          )}
        </div>
      </Card>
      <div className="split">
        <Card title={t("Evidência por peça")}>
          <ul className="checklist">
            {[
              "Imagem original",
              "Regiões detectadas",
              "Esperado × detectado",
              "Versão da referência",
            ].map((s) => (
              <li key={s}>
                <Check size={16} />
                {t(s)}
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("Base para dataset")}>
          <p>{t("Amostras aprovadas e reprovadas")}</p>
          <p className="muted">{t("Curadoria para melhoria dos modelos")}</p>
        </Card>
      </div>
      {detail && (
        <Modal onClose={close} labelledBy="detail-title">
          <div className="modal-head">
            <h2 id="detail-title">
              {t("Detalhes da inspeção")} · #{detail.id}
            </h2>
            <button
              autoFocus
              className="icon-button"
              aria-label={t("Fechar")}
              onClick={close}
            >
              <X />
            </button>
          </div>
          <p>
            PN {detail.pn} · v{detail.version} · {detail.time}
          </p>
          <Evidence inspection={detail} />
          <Card title={t("Revisão humana")}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onReview(
                  {
                    ...detail,
                    result: decision,
                    review: { note, result: decision },
                  },
                  note,
                );
                setSaved(true);
              }}
            >
              <div className="review-form">
                <label>
                  {t("Confirmar ou corrigir resultado")}
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value as Outcome)}
                  >
                    {(["Aprovado", "Reprovado", "Revisão"] as const).map(
                      (v) => (
                        <option key={v} value={v}>
                          {t(v)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  {t("Registrar observação")}
                  <input
                    required
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button className="primary">{t("Salvar")}</button>
              </div>
              {saved && (
                <p role="status" className="good">
                  {t("Revisão salva nesta sessão.")}
                </p>
              )}
            </form>
          </Card>
        </Modal>
      )}
    </>
  );
}
