import type { RefObject } from "react";
import type { City } from "../types";
import { CloseIcon, ExternalLinkIcon } from "./Icons";

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  city: City;
};

export function AboutDialog({ dialogRef, city }: Props) {
  const circular = city.routes.filter((route) => route.circular).map((route) => route.code);

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
        open-routes reúne los recorridos de {city.name} en un mapa claro: elige origen y destino,
        descubre qué rutas te sirven y consulta sus horarios, tarifas y trayectos completos. Sin
        publicidad, sin cuentas y sin enviar tu ubicación a nuestro servidor.
      </p>

      <h3>Cómo leer el mapa</h3>
      <p>
        Cada color es una ruta. Al elegirla, el mapa dibuja su trazado, sus paradas y, cuando el
        operador las publica, las vías por las que pasa. El botón de ubicación ordena las rutas por
        distancia real a la línea del recorrido (no a una parada inventada).
      </p>
      <p>
        Los buscadores de origen y destino aceptan barrios, sitios y paradas. La cercanía se mide
        contra la línea del recorrido; por eso buscamos rutas en un radio de 500 m.
      </p>
      <p>
        Con origen y destino, el planificador busca rutas directas y ordena las opciones por tiempo
        estimado: caminata, espera y tramo en bus. Por ahora no combina transbordos.
      </p>
      {circular.length > 0 && (
        <p>
          Rutas marcadas como circulares por el operador: {circular.join(", ")}. El planificador solo
          cierra la vuelta cuando el trazado termina cerca del inicio.
        </p>
      )}
      <p>
        Cuando un sentido está dividido en el mapa, el planificador lo marca como no verificado en
        lugar de inventar una conexión. La espera usa la frecuencia del día en la zona horaria de la
        ciudad y no comprueba festivos, disponibilidad ni tráfico; las consultas fuera de horario se
        marcan.
      </p>

      <h3>Privacidad</h3>
      <p>
        Tu ubicación y los lugares que eliges se procesan en tu navegador; la cercanía no se
        consulta en la API ni se guarda. El mapa base pide teselas a OpenStreetMap, que recibe la
        zona visible y tu IP. Cloudflare sirve el sitio y mide tráfico sin cookies. No hay cuentas
        ni publicidad.
      </p>

      <h3>Datos y límites</h3>
      <p>
        Los datos provienen de las fuentes públicas listadas abajo y se publican como referencia.
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
        usan datos publicados por cada operador o su feed GTFS. El código está bajo licencia MIT.
      </p>

      <div className="about__footer">
        <a href="https://github.com/jdsalasca/open-routes" target="_blank" rel="noreferrer">
          github.com/jdsalasca/open-routes
        </a>
        <span>Hecho para las comunidades.</span>
      </div>
    </dialog>
  );
}
