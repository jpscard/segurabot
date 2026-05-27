import { collection, setDoc, doc, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../infrastructure/firebase';
import { extractFAQsFromPDF } from '../infrastructure/gemini';
import { DynamicEmbeddingService } from '../infrastructure/DynamicEmbeddingService';

export async function uploadRealDataToKnowledgeBase(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      let sourceId: string | null = null;
      try {
        // 1. Registrar a fonte de conhecimento no Firestore
        const sourceRef = collection(db, 'knowledge_sources');
        const fileType = file.name.endsWith('.pdf') ? 'pdf' : file.name.endsWith('.csv') ? 'csv' : 'json';
        const sourceDoc = await addDoc(sourceRef, {
          name: file.name,
          type: fileType,
          status: 'processing',
          chunkCount: 0,
          createdAt: new Date().toISOString()
        });
        sourceId = sourceDoc.id;

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
        const embeddingService = new DynamicEmbeddingService();

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
            sourceId: sourceId, // Vínculo com a fonte de conhecimento
            embedding: embedding
          });
          count++;
        }

        // 2. Atualizar o status da fonte de conhecimento para 'completed' com o total de chunks
        if (sourceId) {
          const sourceDocRef = doc(db, 'knowledge_sources', sourceId);
          await updateDoc(sourceDocRef, {
            status: 'completed',
            chunkCount: count
          });
        }

        resolve(count);
      } catch (error) {
        console.error("Erro processando arquivo:", error);
        
        // 3. Atualizar o status da fonte para 'error' em caso de falha no pipeline
        if (sourceId) {
          try {
            const sourceDocRef = doc(db, 'knowledge_sources', sourceId);
            await updateDoc(sourceDocRef, {
              status: 'error'
            });
          } catch (e) {
            console.error("Erro ao atualizar status de erro da fonte:", e);
          }
        }
        
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
