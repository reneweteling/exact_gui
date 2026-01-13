import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Enforce dark mode by adding 'dark' class to html element
document.documentElement.classList.add('dark');

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
