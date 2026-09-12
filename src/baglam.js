// Yanıt-bağlamı: kullanıcı bir mesaja yanıt olarak "tigobot sence bu doğru mu"
// yazdığında, yanıtlanan mesajın içeriğini bağlam olarak çeker.
// Örn: A:"bence b" -> B (A'ya yanıt):"tigobot sence bu doğru mu" => bot "b" iddiasını görür.
const { clip } = require('./sanitize');

const MAX_REF = 1000;

// Discord yanıt referansındaki orijinal mesajı okur (yoksa null).
// Silinmiş/çekilemeyen mesajda sessizce null döner, akış normal soruya düşer.
async function yanitBaglami(message, max = MAX_REF) {
  try {
    const refId = message && message.reference && message.reference.messageId;
    if (!refId || !message.channel || !message.channel.messages) return null;
    const ref = await message.channel.messages.fetch(refId).catch(() => null);
    if (!ref) return null;
    const kim = (ref.author && (ref.author.tag || ref.author.username)) || '?';
    let icerik = String((ref.content || '')).trim();
    if (!icerik && ref.attachments && ref.attachments.size > 0) icerik = '[görsel/ek dosya]';
    if (!icerik && ref.embeds && ref.embeds.length > 0) icerik = '[gömülü içerik]';
    if (!icerik) return null;
    return `Yanıtlanan mesaj (@${kim}): "${clip(icerik, max)}"`;
  } catch {
    return null;
  }
}

module.exports = { yanitBaglami, MAX_REF };
