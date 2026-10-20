import os
import uuid
import re
from typing import List, Dict, Any, Optional
from pypdf import PdfReader

class DocumentChunk:
    def __init__(self, chunk_id: str, doc_id: str, text: str, page_number: int, metadata: Dict[str, Any]):
        self.chunk_id = chunk_id
        self.doc_id = doc_id
        self.text = text
        self.page_number = page_number
        self.metadata = metadata

class DocumentProcessor:
    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        # In-memory document storage and vector chunk store
        self.documents: Dict[str, Dict[str, Any]] = {}
        self.chunks_store: Dict[str, List[DocumentChunk]] = {}

    def extract_text_from_pdf(self, file_path: str) -> List[Dict[str, Any]]:
        """Extracts text page by page with page number metadata."""
        reader = PdfReader(file_path)
        pages_data = []
        for idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            pages_data.append({
                "page_number": idx + 1,
                "text": text.strip()
            })
        return pages_data

    def chunk_document(self, doc_id: str, pages_data: List[Dict[str, Any]]) -> List[DocumentChunk]:
        """Splits document text into overlapping chunks while tracking page provenance."""
        chunks = []
        for page in pages_data:
            page_num = page["page_number"]
            text = page["text"]
            words = text.split()
            
            if not words:
                continue

            for i in range(0, len(words), self.chunk_size - self.chunk_overlap):
                chunk_words = words[i:i + self.chunk_size]
                chunk_text = " ".join(chunk_words)
                if len(chunk_text.strip()) > 20:
                    chunk_id = f"{doc_id}_p{page_num}_{i}"
                    chunk = DocumentChunk(
                        chunk_id=chunk_id,
                        doc_id=doc_id,
                        text=chunk_text,
                        page_number=page_num,
                        metadata={"word_count": len(chunk_words)}
                    )
                    chunks.append(chunk)
        return chunks

    def process_pdf(self, doc_id: str, filename: str, file_path: str) -> Dict[str, Any]:
        """Runs background pipeline: Validate -> Extract -> Chunk -> Index."""
        pages_data = self.extract_text_from_pdf(file_path)
        chunks = self.chunk_document(doc_id, pages_data)
        
        doc_info = {
            "doc_id": doc_id,
            "filename": filename,
            "total_pages": len(pages_data),
            "total_chunks": len(chunks),
            "status": "Ready",
            "pages": pages_data
        }
        
        self.documents[doc_id] = doc_info
        self.chunks_store[doc_id] = chunks
        return doc_info

    def query_rag(self, doc_id: str, query: str, top_k: int = 3) -> Dict[str, Any]:
        """Grounded retrieval search across document chunks with page citations."""
        if doc_id not in self.chunks_store:
            return {"error": "Document not found or indexed."}

        chunks = self.chunks_store[doc_id]
        query_words = set(re.findall(r'\w+', query.lower()))

        # TF-IDF / Keyword match scoring for grounded retrieval
        scored_chunks = []
        for chunk in chunks:
            chunk_words = set(re.findall(r'\w+', chunk.text.lower()))
            overlap = len(query_words.intersection(chunk_words))
            if overlap > 0:
                scored_chunks.append((overlap, chunk))

        scored_chunks.sort(key=lambda x: x[0], reverse=True)
        top_results = scored_chunks[:top_k]

        retrieved_contexts = []
        citations = []
        for score, chunk in top_results:
            retrieved_contexts.append(chunk.text)
            citations.append({
                "page": chunk.page_number,
                "excerpt": chunk.text[:150] + "...",
                "score": score
            })

        return {
            "query": query,
            "contexts": retrieved_contexts,
            "citations": citations,
            "grounded_answer": f"Based on page(s) {', '.join(str(c['page']) for c in citations)}: " + 
                              (" ".join(retrieved_contexts[:2])[:400] + "...") if retrieved_contexts else "No direct matches found in document."
        }

document_processor = DocumentProcessor()