import app from "./app";

/** Local / self-hosted entry point. On Netlify the app is wrapped by a function instead. */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Message reader running at http://localhost:${PORT}`);
  console.log(`Calendar agent available at http://localhost:${PORT}/calendar`);
});
