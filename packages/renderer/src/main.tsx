import React from "react";
import ReactDOM from "react-dom/client";
import Launcher from "./components/Launcher";
import "normalize.css";
import "./global.scss";

const root = ReactDOM.createRoot(document.getElementById("root") as Element);
root.render(
  <React.StrictMode>
    <Launcher />
  </React.StrictMode>,
);
