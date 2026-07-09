// openclerk-core's providers reference the global fetch/URLSearchParams only inside function
// bodies (lookupCitation(), authenticate(), etc.), never at module-load time, so it's enough that
// these shims install before any exported handler below is actually invoked -- which is
// guaranteed, since google.script.run can't call a handler until this whole module has finished
// initializing.
import { installFetchShim } from "./shims/fetchShim";
import { installUrlSearchParamsShim } from "./shims/urlSearchParamsShim";

installFetchShim();
installUrlSearchParamsShim();

import { getProviderList, runOnlineLookup } from "./onlineLookup";
import { getBluebookEditionList, runBluebookCheck, goToCitationInDocument } from "./bluebookCheck";

export { getProviderList, runOnlineLookup, getBluebookEditionList, runBluebookCheck, goToCitationInDocument };

export function onOpen(): void {
  DocumentApp.getUi().createAddonMenu().addItem("Open OpenClerk", "showSidebar").addToUi();
}

export function showSidebar(): void {
  const html = HtmlService.createHtmlOutputFromFile("sidebar").setTitle("OpenClerk");
  DocumentApp.getUi().showSidebar(html);
}
