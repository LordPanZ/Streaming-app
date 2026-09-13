/** Estado del catálogo: consulta, resultados y facetas (FR-028 a FR-031). */

import { useCallback, useEffect, useState } from 'react';
import type { CatalogFacets, CatalogPage, CatalogQuery } from '../../shared/types';
import { api, describeApiError, unwrap } from '../api';

const EMPTY_PAGE: CatalogPage = { items: [], total: 0, offset: 0, limit: 60 };

export function useCatalog(initialQuery: CatalogQuery) {
  const [query, setQuery] = useState<CatalogQuery>(initialQuery);
  const [page, setPage] = useState<CatalogPage>(EMPTY_PAGE);
  const [facets, setFacets] = useState<CatalogFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextPage, nextFacets] = await Promise.all([
        unwrap(api.catalog.query(query)),
        unwrap(api.catalog.facets()),
      ]);
      setPage(nextPage);
      setFacets(nextFacets);
      setError(null);
    } catch (caught) {
      // Los resultados anteriores no responden a la consulta que acaba de
      // fallar: dejarlos en pantalla es enseñar una lista que no corresponde
      // al filtro. Fue justo así como un error de validación en la sección
      // «Me interesa» pareció que el filtro no filtraba.
      setPage(EMPTY_PAGE);
      setError(describeApiError(caught));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // El proceso principal avisa cuando el catálogo cambia por el agente, una
  // importación o un borrado; así la interfaz no tiene que sondear.
  useEffect(() => api.on.catalogChanged(() => void reload()), [reload]);

  const patchQuery = useCallback((patch: Partial<CatalogQuery>) => {
    setQuery((current) => ({ ...current, ...patch, offset: 0 }));
  }, []);

  return { query, setQuery, patchQuery, page, facets, loading, error, reload };
}
