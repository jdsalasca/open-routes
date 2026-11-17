package top.eridu.openroutes.remote;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Lector CSV mínimo para GTFS, sin dependencias y reutilizando arreglos. */
final class GtfsCsv {

    private GtfsCsv() {
    }

    static BufferedReader reader(ZipFile zip, String name) throws IOException {
        ZipEntry entry = zip.getEntry(name);
        if (entry == null) {
            throw new IOException("Falta " + name + " en el feed GTFS");
        }
        if (entry.getSize() > 900L * 1024 * 1024) {
            throw new IOException(name + " excede el tamaño permitido");
        }
        InputStream in = zip.getInputStream(entry);
        return new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8), 1 << 16);
    }

    static Map<String, Integer> header(BufferedReader reader) throws IOException {
        String line = reader.readLine();
        if (line == null) {
            throw new IOException("Archivo GTFS vacío");
        }
        List<String> fields = parse(line);
        Map<String, Integer> index = new HashMap<>();
        for (int i = 0; i < fields.size(); i++) {
            String name = fields.get(i).replace("\uFEFF", "").trim();
            index.put(name, i);
        }
        return index;
    }

    static List<String> parse(String line) {
        List<String> fields = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (quoted) {
                if (ch == '"') {
                    if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
                        current.append('"');
                        i++;
                    } else {
                        quoted = false;
                    }
                } else {
                    current.append(ch);
                }
            } else if (ch == '"') {
                quoted = true;
            } else if (ch == ',') {
                fields.add(current.toString());
                current.setLength(0);
            } else {
                current.append(ch);
            }
        }
        fields.add(current.toString());
        return fields;
    }

    static void parseInto(String line, String[] out) {
        int field = 0;
        int start = 0;
        boolean quoted = false;
        StringBuilder escaped = null;
        for (int i = 0; i <= line.length(); i++) {
            char ch = i == line.length() ? ',' : line.charAt(i);
            if (quoted) {
                if (ch == '"') {
                    if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
                        if (escaped == null) {
                            escaped = new StringBuilder();
                        }
                        escaped.append(line, start, i).append('"');
                        i++;
                        start = i + 1;
                    } else {
                        quoted = false;
                        if (escaped == null) {
                            escaped = new StringBuilder();
                        }
                        escaped.append(line, start, i);
                        start = i + 1;
                    }
                }
            } else if (ch == '"' && i == start) {
                quoted = true;
                start = i + 1;
            } else if (ch == ',') {
                if (field < out.length) {
                    if (escaped != null) {
                        escaped.append(line, start, i);
                        out[field] = escaped.toString();
                        escaped = null;
                    } else {
                        out[field] = line.substring(start, i);
                    }
                }
                field++;
                start = i + 1;
                if (field >= out.length) {
                    return;
                }
            }
        }
        for (int i = field; i < out.length; i++) {
            out[i] = "";
        }
    }

    static String value(String[] row, Map<String, Integer> index, String name) {
        Integer position = index.get(name);
        if (position == null || position >= row.length) {
            return "";
        }
        String value = row[position];
        return value == null ? "" : value.trim();
    }
}
