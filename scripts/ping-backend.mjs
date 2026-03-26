const url = process.env.BACKEND_URL || "https://nexa-hr-backend.onrender.com/";

async function main() {
  const startedAt = Date.now();
  const res = await fetch(url, {
    method: "GET",
    headers: { "user-agent": "nexa-hr-keepwarm/1.0" }
  });
  const elapsedMs = Date.now() - startedAt;
  const text = await res.text().catch(() => "");

  if (!res.ok) {
    console.error(`Keep-warm failed: ${res.status} ${res.statusText} (${elapsedMs}ms)`);
    if (text) console.error(text.slice(0, 500));
    process.exit(1);
  }

  console.log(`Keep-warm OK: ${res.status} (${elapsedMs}ms)`);
  if (text) console.log(text.slice(0, 200));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

