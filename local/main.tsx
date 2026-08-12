import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";
import { FovWorkbench } from "../src/fov/components/FovWorkbench";

const route = window.location.pathname.replace(/\/+$/, "") || "/";
createRoot(document.getElementById("root")!).render(
  <StrictMode>{route === "/fov" ? <FovWorkbench /> : <Home />}</StrictMode>,
);
