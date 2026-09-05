import { createRoot } from "react-dom/client";
import "./theme/tokens.css";
import "./theme/base.css";
import { App } from "./App";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);
}
