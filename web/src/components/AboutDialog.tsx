import type { RefObject } from "react";
import type { City } from "../types";
import { CloseIcon, ExternalLinkIcon } from "./Icons";

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  city: City;
};

export function AboutDialog({ dialogRef, city }: Props) {
  return (
    <dialog
      ref={dialogRef}
      className="about"
      aria-labelledby="about-title"
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="about__top">
        <h2 id="about-title">Transporte público que se entiende.</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Cerrar"
          onClick={() => dialogRef.current?.close()}
        >
          <CloseIcon />
        </button>
      </div>

      <p>
        open-routes reúne los recorridos de {city.name} en un mapa claro: activa tu ubicación,
        descubre qué rutas pasan cerca y consulta sus horarios, tarifas y trayectos completos. Sin
        publicidad, sin cuentas y sin guardar tu ubicación.
      </p>

      <h3>Cómo leer el mapa</h3>
      <p>
        Cada color es una ruta. Al elegirla, el mapa dibuja su trazado, sus paradas de despacho y
        las vías por las que pasa. El botón de ubicación ordena las rutas por distancia real a la
        línea del recorrido (no a una parada inventada).
      </p>
      <p>
        El buscador de origen acepta barrios y sitios principales. Cuando un barrio no tiene un
        punto oficial en el mapa, usamos el punto de despacho o retorno que el operador dibuja en
        su recorrido; por eso buscamos rutas en un radio de 500 m.
      </p>
      <p>
        Con origen y destino, el planificador busca rutas directas y ordena las opciones por tiempo
        estimado: caminata, espera y tramo en bus. Por ahora no combina transbordos.
      </p>

      <h3>Datos y límites</h3>
      <p>
        Los trazados provienen de los mapas públicos de la UT Mi Ruta y se publican como referencia.
        Las rutas, horarios y tarifas pueden cambiar; la información oficial del operador siempre
        manda. Esta herramienta no reemplaza los avisos del conductor ni de la empresa.
      </p>
      <ul>
        {city.sources.map((source) => (
          <li key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.label} <ExternalLinkIcon size={10} />
            </a>
          </li>
        ))}
      </ul>

      <h3>Tecnología</h3>
      <p>
        React, Vite, SCSS, Leaflet y Spring Boot. El mapa base es de OpenStreetMap y las rutas
        usan los trazados publicados por el operador. El código está bajo licencia MIT.
      </p>

      <div className="about__footer">
        <a href="https://github.com/jdsalasca/open-routes" target="_blank" rel="noreferrer">
          github.com/jdsalasca/open-routes
        </a>
        <span>Hecho para las comunidades de Boyacá.</span>
      </div>
    </dialog>
  );
}
