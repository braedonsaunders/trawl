function clickMailto(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openMailtoUrls(
  urls: string[],
  delayMs = 200
): Promise<void> {
  for (const [index, url] of urls.entries()) {
    clickMailto(url);

    if (index < urls.length - 1) {
      await sleep(delayMs);
    }
  }
}
