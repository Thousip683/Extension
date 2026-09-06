"""
Generate synthetic test certificates and extension icons for the Pre-Submission Error Guard project.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def create_certificate(filename, name, dob, cert_no, is_blurry=False, make_oversized=False):
    # Dimensions
    width, height = 800, 600
    img = Image.new('RGB', (width, height), color=(253, 252, 248))
    draw = ImageDraw.Draw(img)

    # Outer decorative borders
    draw.rectangle([(20, 20), (width - 20, height - 20)], outline=(180, 140, 50), width=4)
    draw.rectangle([(28, 28), (width - 28, height - 28)], outline=(40, 60, 100), width=2)

    # Header Emblem / Stamp background
    draw.ellipse([(width//2 - 45, 45), (width//2 + 45, 135)], outline=(180, 140, 50), width=3)
    draw.text((width//2, 80), "GOVT OF AP", fill=(180, 140, 50), anchor="mm")
    draw.text((width//2, 105), "★ OFFICIAL ★", fill=(40, 60, 100), anchor="mm")

    # Title
    draw.text((width//2, 160), "GOVERNMENT OF ANDHRA PRADESH", fill=(20, 40, 80), anchor="mm")
    draw.text((width//2, 185), "REVENUE DEPARTMENT - CASTE & RESIDENCE CERTIFICATE", fill=(100, 80, 40), anchor="mm")

    # Body Paragraph
    draw.text((60, 230), "This is to certify that the applicant detailed below is a bonafide resident.", fill=(60, 60, 60))

    # Certificate details block
    start_y = 280
    line_spacing = 45

    fields = [
        ("Full Name:", name),
        ("Date of Birth:", dob),
        ("Certificate Number:", cert_no),
        ("Date of Issue:", "10/01/2024"),
        ("Issuing Authority:", "Tahsildar, Amaravati")
    ]

    for i, (label, val) in enumerate(fields):
        y = start_y + i * line_spacing
        draw.rectangle([(55, y - 5), (width - 55, y + 30)], fill=(245, 247, 250), outline=(220, 225, 235))
        draw.text((70, y + 12), label, fill=(50, 50, 50), anchor="lm")
        draw.text((280, y + 12), val, fill=(15, 30, 70), anchor="lm")

    # Seal & Signature Simulation
    draw.ellipse([(600, 490), (700, 570)], outline=(30, 80, 180), width=2)
    draw.text((650, 520), "SEAL", fill=(30, 80, 180), anchor="mm")
    draw.text((650, 540), "AUTHORIZED", fill=(30, 80, 180), anchor="mm")

    draw.line([(80, 550), (220, 550)], fill=(80, 80, 80), width=1)
    draw.text((150, 565), "Signature of Verifier", fill=(100, 100, 100), anchor="mm")

    if is_blurry:
        # Apply heavy blur and low contrast
        img = img.filter(ImageFilter.GaussianBlur(radius=3.5))

    os.makedirs(os.path.dirname(filename), exist_ok=True)

    if make_oversized:
        # Save as large uncompressed image or high dimension to exceed 2MB
        large_img = img.resize((3200, 2400), Image.Resampling.LANCZOS)
        large_img.save(filename, "PNG", compress_level=0)
        # Verify size, if < 2MB, append padding bytes
        current_size = os.path.getsize(filename)
        if current_size < 2100000:
            with open(filename, "ab") as f:
                f.write(b"\0" * (2200000 - current_size))
    else:
        img.save(filename, "PNG")

    print(f"Generated: {filename} ({os.path.getsize(filename)} bytes)")

def create_icons(asset_dir):
    os.makedirs(asset_dir, exist_ok=True)
    sizes = [16, 48, 128]
    for size in sizes:
        img = Image.new('RGBA', (size, size), color=(0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        # Draw shield
        pad = max(1, size // 16)
        # Background shield polygon
        points = [
            (size // 2, pad),
            (size - pad, size // 4),
            (size - pad, size * 5 // 8),
            (size // 2, size - pad),
            (pad, size * 5 // 8),
            (pad, size // 4)
        ]
        draw.polygon(points, fill=(24, 119, 242), outline=(13, 71, 161))
        # Inner checkmark
        p1 = (size * 5 // 16, size // 2)
        p2 = (size * 7 // 16, size * 11 // 16)
        p3 = (size * 11 // 16, size * 5 // 16)
        line_w = max(1, size // 10)
        draw.line([p1, p2, p3], fill=(255, 255, 255), width=line_w)
        
        path = os.path.join(asset_dir, f"icon{size}.png")
        img.save(path, "PNG")
        print(f"Generated Icon: {path}")

if __name__ == "__main__":
    docs_dir = os.path.dirname(os.path.abspath(__file__))
    ext_assets = os.path.join(os.path.dirname(os.path.dirname(docs_dir)), "extension", "assets")

    create_certificate(os.path.join(docs_dir, "valid_certificate.png"), "Siva Kumar", "12/05/2005", "AP123456")
    create_certificate(os.path.join(docs_dir, "name_mismatch.png"), "Siva Kumarr", "12/05/2005", "AP123456")
    create_certificate(os.path.join(docs_dir, "dob_mismatch.png"), "Siva Kumar", "18/09/2004", "AP123456")
    create_certificate(os.path.join(docs_dir, "blurry_cert.png"), "Siva Kumar", "12/05/2005", "AP123456", is_blurry=True)
    create_certificate(os.path.join(docs_dir, "oversized_doc.png"), "Siva Kumar", "12/05/2005", "AP123456", make_oversized=True)

    create_icons(ext_assets)
