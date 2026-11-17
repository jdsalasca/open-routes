package top.eridu.openroutes.remote;

/** La ciudad remota no se pudo descargar o construir. */
public class RemoteCityException extends RuntimeException {

    public RemoteCityException(String message) {
        super(message);
    }

    public RemoteCityException(String message, Throwable cause) {
        super(message, cause);
    }
}
