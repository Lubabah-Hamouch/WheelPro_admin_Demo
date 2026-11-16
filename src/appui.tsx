import { createContext, useContext } from "react";

export type AppUi = {
  /** The top bar's live filter, for list pages. */
  filter: string;
  setFilter: (v: string) => void;
  /** The "Create invoice" dialog, from anywhere. */
  openCreateInvoice: (clientId?: string) => void;
};

export const AppUiCtx = createContext<AppUi>({ filter: "", setFilter: () => {}, openCreateInvoice: () => {} });
export const useAppUi = () => useContext(AppUiCtx);
