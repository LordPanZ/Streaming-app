/**
 * FR-056 · enlaces a la plataforma.
 *
 * Lo que se comprueba aquí no es que las direcciones existan —eso no se puede
 * desde aquí, y está declarado en ADR-018— sino que el enlace **dice lo que
 * hace**: que una búsqueda se anuncie como búsqueda, que una portada no se
 * anuncie como ficha, y que el título viaje bien codificado.
 */

import { describe, expect, it } from 'vitest';
import {
  platformLink,
  platformsWithLinks,
  type PlatformLink,
} from '../../src/core/domain/platform-links';
import { PLATFORMS } from '../../src/core/domain/platforms';

function link(id: string, name = 'Plataforma', title = 'La hora silenciosa'): PlatformLink {
  const result = platformLink(id, name, title);
  if (!result) throw new Error(`sin enlace para ${id}`);
  return result;
}

describe('platformLink (FR-056)', () => {
  it('todas las plataformas del catálogo tienen dirección', () => {
    // Si alguien añade una plataforma a PLATFORMS y olvida su dirección, esta
    // prueba lo dice antes de que el usuario se encuentre un hueco.
    const missing = PLATFORMS.filter((platform) => platformLink(platform.id, platform.name, 'x') === null);
    expect(missing.map((platform) => platform.id)).toEqual([]);
  });

  it('no se inventa una dirección para una plataforma desconocida', () => {
    expect(platformLink('plataforma-inventada', 'Inventada', 'x')).toBeNull();
  });

  it('cuando hay buscador, lleva el título codificado y lo dice', () => {
    const result = link('netflix', 'Netflix');
    expect(result.kind).toBe('search');
    expect(result.label).toBe('Buscar en Netflix');
    expect(result.url).toContain('La%20hora%20silenciosa');
  });

  it('codifica lo que rompería la dirección', () => {
    const result = link('netflix', 'Netflix', 'Tú & yo: ¿qué pasó?');
    expect(result.url).not.toContain(' ');
    expect(result.url).not.toContain('&yo');
    expect(decodeURIComponent(result.url.split('=')[1] ?? '')).toBe('Tú & yo: ¿qué pasó?');
  });

  it('sin buscador conocido abre la portada, y el texto no promete más', () => {
    const result = link('hbo-max', 'HBO Max');
    expect(result.kind).toBe('home');
    expect(result.label).toBe('Abrir HBO Max');
    // Una portada no puede llevar el título dentro: sería fingir una búsqueda.
    expect(result.url).not.toContain('silenciosa');
  });

  it('todas las direcciones son https', () => {
    for (const platform of PLATFORMS) {
      expect(link(platform.id, platform.name).url.startsWith('https://')).toBe(true);
    }
  });

  it('ninguna dirección de búsqueda se queda sin el término', () => {
    for (const platform of PLATFORMS) {
      const result = link(platform.id, platform.name, 'prueba');
      if (result.kind === 'search') expect(result.url).toContain('prueba');
    }
  });

  it('el inventario declarado coincide con el catálogo de plataformas', () => {
    expect(platformsWithLinks()).toEqual([...PLATFORMS.map((p) => p.id)].sort());
  });
});
