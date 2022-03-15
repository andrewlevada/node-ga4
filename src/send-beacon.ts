import https from "https";

export function sendBeacon(url: string, data: any) {
    if (!data) https.get(url)
    else https.request(url, { method: "POST" }).write(data);
}
