package top.eridu.openroutes.external;

/** Un servicio externo no respondió o devolvió datos que no se pueden leer. */
public class ExternalLookupException extends RuntimeException {

    public ExternalLookupException(String message, Throwable cause) {
        super(message, cause);
    }

    public ExternalLookupException(String message) {
        super(message);
    }
}
