package com.chatapp.controller;

import com.mongodb.client.gridfs.model.GridFSFile;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.InputStreamResource;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.gridfs.GridFsOperations;
import org.springframework.data.mongodb.gridfs.GridFsTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/upload")
public class UploadController {

    @Autowired
    private GridFsTemplate gridFsTemplate;

    @Autowired
    private GridFsOperations gridFsOperations;

    @PostMapping
    public Map<String, String> uploadFile(@RequestParam("file") MultipartFile file) {
        Map<String, String> response = new HashMap<>();
        try {
            String originalFilename = file.getOriginalFilename();
            String extension = "";
            if (originalFilename != null && originalFilename.lastIndexOf(".") > 0) {
                extension = originalFilename.substring(originalFilename.lastIndexOf("."));
            }
            String newFilename = java.util.UUID.randomUUID().toString() + extension;

            // Guess file type based on extension
            String type = "file";
            String contentType = file.getContentType();
            if (extension.matches("(?i)\\.(jpg|jpeg|png|gif|webp)"))
                type = "image";
            else if (extension.matches("(?i)\\.(mp4|webm)"))
                type = "video";
            else if (extension.matches("(?i)\\.(mp3|wav|ogg|m4a)"))
                type = "audio";

            // Store in GridFS
            gridFsTemplate.store(file.getInputStream(), newFilename, contentType);

            // Use the API path
            response.put("url", "/api/upload/files/" + newFilename);
            response.put("fileName", originalFilename);
            response.put("fileType", type);

        } catch (Exception e) {
            e.printStackTrace();
            response.put("error", "Error uploading file");
        }
        return response;
    }

    @GetMapping("/files/{filename}")
    public ResponseEntity<InputStreamResource> getFile(@PathVariable String filename) {
        try {
            GridFSFile gridFSFile = gridFsTemplate.findOne(new Query(Criteria.where("filename").is(filename)));
            if (gridFSFile != null) {
                org.springframework.data.mongodb.gridfs.GridFsResource resource = gridFsOperations
                        .getResource(gridFSFile);
                return ResponseEntity.ok()
                        .contentType(
                                MediaType.parseMediaType(resource.getContentType() != null ? resource.getContentType()
                                        : "application/octet-stream"))
                        .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + resource.getFilename() + "\"")
                        .body(new InputStreamResource(resource.getInputStream()));
            }
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.internalServerError().build();
        }
    }
}
