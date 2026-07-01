package com.englishwebapp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class AccountSettingsForm {

    @NotBlank
    @Size(max = 150)
    private String displayName;

    private String avatarUrl;
}
