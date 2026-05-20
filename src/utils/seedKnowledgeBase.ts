import { collection, setDoc, doc } from 'firebase/firestore';
import { db } from '../infrastructure/firebase';
import { extractFAQsFromPDF } from '../infrastructure/gemini';
import { GeminiEmbeddingService } from '../infrastructure/GeminiEmbeddingService';

export async function uploadRealDataToKnowledgeBase(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        let dataToUpload: any[] = [];
        if (file.name.endsWith('.json')) {
          const text = e.target?.result as string;
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            dataToUpload = parsed;
          } else {
            throw new Error("O arquivo JSON deve ser um array de objetos.");
          }
        } else if (file.name.endsWith('.csv')) {
          const text = e.target?.result as string;
          // Parse simples de CSV (assumindo formato: category,question,answer,source)
          const lines = text.split('\n');
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Regex básico para ignorar vírgulas dentro de aspas duplas
            const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').trim());
            
            let obj: any = {};
            headers.forEach((header, index) => {
              if (header && values[index]) {
                obj[header] = values[index];
              }
            });
            
            if (obj.question && obj.answer) {
              dataToUpload.push({
                category: obj.category || "Geral",
                question: obj.question,
                answer: obj.answer,
                source: obj.source || "CSV Upload"
              });
            }
          }
        } else if (file.name.endsWith('.pdf')) {
          const base64Data = e.target?.result as string;
          dataToUpload = await extractFAQsFromPDF(base64Data);
        } else {
          throw new Error("Formato de arquivo não suportado. Use .csv, .json ou .pdf");
        }

        const kbRef = collection(db, 'knowledge_base');
        let count = 0;
        const embeddingService = new GeminiEmbeddingService();

        for (const item of dataToUpload) {
          if (!item.question || !item.answer) continue;

          const newDocRef = doc(kbRef);
          
          let embedding: number[] | null = null;
          try {
            embedding = await embeddingService.generateEmbedding(item.question);
          } catch (e) {
            console.warn("Não foi possível gerar embedding para a pergunta:", item.question, e);
          }

          await setDoc(newDocRef, {
            category: item.category || 'Geral',
            question: item.question,
            answer: item.answer,
            source: item.source || file.name,
            embedding: embedding
          });
          count++;
        }

        resolve(count);
      } catch (error) {
        console.error("Erro processando arquivo:", error);
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    
    if (file.name.endsWith('.pdf')) {
      reader.readAsDataURL(file); // Gemini precisa de base64
    } else {
      reader.readAsText(file);
    }
  });
}
