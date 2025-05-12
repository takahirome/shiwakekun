import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import App from "./App";
import "@mantine/core/styles.css";

// Mantineテーマの作成
const theme = createTheme({
  fontFamily: "sans-serif",
  primaryColor: "blue",
  defaultRadius: "md",
  colors: {
    // 黒色の定義を追加
    dark: [
      "#C1C2C5",
      "#A6A7AB",
      "#909296",
      "#5c5f66",
      "#373A40",
      "#2C2E33",
      "#25262b",
      "#1A1B1E",
      "#141517",
      "#101113",
    ],
  },
  components: {
    Text: {
      defaultProps: {
        c: "black",
      },
    },
    Title: {
      defaultProps: {
        c: "black",
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <App />
    </MantineProvider>
  </React.StrictMode>
);
