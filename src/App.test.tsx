import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import App, { nav } from "./App";
import { I18nProvider } from "./i18n";
import { validateReference, mockData } from "./data";
import { en, pt } from "./locales";
const mount = () =>
  render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
describe("navigation and localization", () => {
  it("preserves exact slide menu order and added sections", () => {
    mount();
    const buttons = within(screen.getByRole("navigation")).getAllByRole(
      "button",
    );
    expect(buttons.map((b) => b.textContent)).toEqual(nav);
  });
  it("navigates all analytical screens and resets filters", async () => {
    mount();
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText("Ativo"), "Bomba 2");
    for (const name of nav.slice(0, 5)) {
      await u.click(
        within(screen.getByRole("navigation")).getByRole("button", { name }),
      );
      expect(
        screen.getByRole("heading", { level: 1, name }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Ativo")).toHaveValue("");
    }
  });
  it("switches language without reload and translates inspection data", async () => {
    mount();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Inspeção atual" }));
    await u.selectOptions(screen.getByLabelText("Idioma"), "en");
    expect(
      screen.getByRole("heading", { level: 1, name: "Current inspection" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Rejected").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Run new inspection" }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
    await u.selectOptions(screen.getByLabelText("Language"), "pt");
    expect(
      screen.getByRole("heading", { level: 1, name: "Inspeção atual" }),
    ).toBeInTheDocument();
  });
  it("has symmetric nonempty translation dictionaries", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    Object.values(en).forEach((s) => expect(s.trim()).not.toBe(""));
  });
});
describe("visual inspection workflows", () => {
  it("shows independent OCR and physical quality and toggles overlays", async () => {
    mount();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Inspeção atual" }));
    expect(screen.getByText("8 / 11")).toBeInTheDocument();
    expect(screen.getAllByText("Qualidade baixa").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Field 8 Divergente" }),
    ).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Imagem original" }));
    expect(
      screen.queryByRole("button", { name: "Field 8 Divergente" }),
    ).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Regiões detectadas" }));
    expect(
      screen.getByRole("button", { name: "Field 8 Divergente" }),
    ).toBeInTheDocument();
    await u.click(
      screen.getByRole("button", { name: "Executar nova inspeção" }),
    );
    expect(
      screen.getByRole("button", { name: "Processando inspeção…" }),
    ).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByText("11 / 11")).toBeInTheDocument(),
    );
  });
  it("queries PN, reports missing PN, and restores an older version", async () => {
    mount();
    const u = userEvent.setup();
    await u.click(
      screen.getByRole("button", { name: "Referência de inspeção" }),
    );
    expect(
      screen.getByText("Campos esperados para o PN selecionado"),
    ).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    await u.clear(screen.getByLabelText("PN"));
    await u.type(screen.getByLabelText("PN"), "000000000");
    await u.click(screen.getByRole("button", { name: "Consultar" }));
    expect(screen.getByText("Nenhum PN encontrado.")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Ativar" }));
    expect(
      screen.getByText("Referência restaurada nesta sessão."),
    ).toBeInTheDocument();
  });
  it("validates imports before activation", () => {
    expect(validateReference({ pns: mockData.references[0].pns })).toBe(true);
    expect(validateReference({ pns: { "123": { fields: [] } } })).toBe(false);
    expect(
      validateReference({
        pns: {
          "265258072": {
            client: "VW",
            family: "ESP",
            fields: [{ id: "1", value: 42, use: "Gravação" }],
          },
        },
      }),
    ).toBe(false);
    expect(validateReference(null)).toBe(false);
  });
  it("filters history, opens piece evidence and saves human review", async () => {
    mount();
    const u = userEvent.setup();
    await u.click(
      screen.getByRole("button", { name: "Histórico de Inspeção" }),
    );
    await u.selectOptions(screen.getByLabelText("Resultado"), "Reprovado");
    expect(
      screen.getAllByRole("button", { name: /Abrir evidência/ }),
    ).toHaveLength(mockData.inspection.history.filter(i => i.result === "Reprovado").length);
    await u.click(
      screen.getByRole("button", { name: "Abrir evidência 2026-054631" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Revisão humana")).toBeInTheDocument();
    await u.selectOptions(
      within(dialog).getByLabelText("Confirmar ou corrigir resultado"),
      "Aprovado",
    );
    await u.type(
      within(dialog).getByLabelText("Registrar observação"),
      "Confirmado em bancada",
    );
    await u.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Revisão salva nesta sessão.",
    );
    await u.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(
      screen.getAllByRole("button", { name: /Abrir evidência/ }),
    ).toHaveLength(mockData.inspection.history.filter(i => i.result === "Reprovado").length - 1);
    await u.type(
      screen.getByLabelText("Buscar identificador ou PN"),
      "no-match",
    );
    expect(
      screen.getByText("Nenhuma inspeção encontrada."),
    ).toBeInTheDocument();
  });
  it("shows visible image failure", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Inspeção atual" }));
    fireEvent.error(screen.getByAltText("Peça com gravação a laser"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível carregar a imagem.",
    );
  });
});
