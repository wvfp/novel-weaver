import { render } from "solid-js/web"
import { Router, Route } from "@solidjs/router"
import { App } from "./app"
import Home from "./pages/home"
import Chat from "./pages/chat"
import Editor from "./pages/editor"
import World from "./pages/world"
import Review from "./pages/review"
import PacingPage from "./pages/pacing"
import "./index.css"

const root = document.getElementById("root")
if (root) {
  render(
    () => (
      <Router root={App}>
        <Route path="/" component={Home} />
        <Route path="/chat" component={Chat} />
        <Route path="/editor/:id" component={Editor} />
        <Route path="/world" component={World} />
        <Route path="/review" component={Review} />
        <Route path="/pacing" component={PacingPage} />
      </Router>
    ),
    root,
  )
}

// Register Service Worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failed — non-critical
    })
  })
}
