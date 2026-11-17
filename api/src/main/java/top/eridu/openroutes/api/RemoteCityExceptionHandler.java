package top.eridu.openroutes.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import top.eridu.openroutes.remote.RemoteCityException;

import java.util.Map;

@RestControllerAdvice
public class RemoteCityExceptionHandler {

    @ExceptionHandler(RemoteCityException.class)
    public ResponseEntity<Map<String, String>> remoteCity(RemoteCityException error) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .header("Retry-After", "30")
                .body(Map.of("error", error.getMessage()));
    }
}
